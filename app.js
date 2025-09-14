import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, getDocs, collection, query, onSnapshot, deleteDoc, updateDoc, where, serverTimestamp, enableIndexedDbPersistence, writeBatch, orderBy, runTransaction } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Service Worker & Firebase Initialization
if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js')); }
const firebaseConfig = { apiKey: "AIzaSyCESxz9Tyc0GvcY5PfWcPda0kArYb_6Jvg", authDomain: "new-hisab-khata.firebaseapp.com", projectId: "new-hisab-khata", storageBucket: "new-hisab-khata.firebasestorage.app", appId: "1:116945944640:web:8d944c18a0e4daaee19fa5" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
enableIndexedDbPersistence(db).catch(err => console.error("Persistence error: ", err.code));

// DOM Elements
const authContainer = document.getElementById('auth-container'), appContainer = document.getElementById('app-container'), setupScreen = document.getElementById('setup-screen'), mainApp = document.getElementById('main-app'), loginBtn = document.getElementById('login-btn'), signupLink = document.getElementById('signup-link'), logoutBtn = document.getElementById('logout-btn'), emailInput = document.getElementById('email'), passwordInput = document.getElementById('password'), datePicker = document.getElementById('date-picker'), categorySelect = document.getElementById('category'), personNameInput = document.getElementById('person-name'), personPhoneInput = document.getElementById('person-phone'), personDetailsDiv = document.getElementById('person-details'), transactionForm = document.getElementById('transaction-form'), modal = document.getElementById('details-modal');
let currentUser, currentOpenEntryId, currentOpenEntryType, hasCheckedBalance = false;
window.chartInstances = [];

// Auth State Logic
onAuthStateChanged(auth, user => {
    if (user) { currentUser = user; authContainer.style.display = 'none'; appContainer.style.display = 'block'; hasCheckedBalance = false; checkInitialBalance(); } 
    else { currentUser = null; authContainer.style.display = 'block'; appContainer.style.display = 'none'; }
});
loginBtn.addEventListener('click', () => signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value).catch(err => alert(err.message)));
signupLink.addEventListener('click', e => { e.preventDefault(); createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value).catch(err => alert(err.message)); });
logoutBtn.addEventListener('click', async () => { await takeDailySnapshot(); signOut(auth); });

async function checkInitialBalance() {
    if (!currentUser || hasCheckedBalance) return;
    const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    try {
        const balanceSnap = await getDoc(balanceRef);
        hasCheckedBalance = true;
        const lastSnapshotDateStr = localStorage.getItem(`lastSnapshot_${currentUser.uid}`);
        if (lastSnapshotDateStr) {
            const todayStr = getDateId(new Date());
            if (lastSnapshotDateStr !== todayStr) {
                const lastDate = new Date(lastSnapshotDateStr);
                await takeDailySnapshot(lastDate);
            }
        }
        if (balanceSnap.exists()) {
            showMainApp();
        } else {
            const initialOnlineInput = document.getElementById('initial-online-balance');
            const initialCashInput = document.getElementById('initial-cash-balance');
            initialOnlineInput.value = '';
            initialCashInput.value = '';
            setupScreen.style.display = 'block';
            mainApp.style.display = 'none';
        }
    } catch (error) { console.error("Error during initial checks:", error); setupScreen.style.display = 'block'; mainApp.style.display = 'none'; }
}

async function showMainApp() {
    setupScreen.style.display = 'none'; mainApp.style.display = 'block';
    if(datePicker) {
        datePicker.valueAsDate = new Date();
        loadDashboardData();
        loadTransactionsAndReportForDate(datePicker.valueAsDate); 
        loadAllDuesAndPayables();
        renderMonthlyChart();
    }
}

const saveInitialBalanceBtn = document.getElementById('save-initial-balance');
const skipBalanceSetupBtn = document.getElementById('skip-balance-setup');
saveInitialBalanceBtn.addEventListener('click', async () => {
    const online = parseFloat(document.getElementById('initial-online-balance').value) || 0;
    const cash = parseFloat(document.getElementById('initial-cash-balance').value) || 0;
    await setDoc(doc(db, 'users', currentUser.uid, 'balance', 'main'), { online, cash, initialOnline: online, initialCash: cash });
    await takeDailySnapshot(new Date(), { online, cash });
    showMainApp();
});
skipBalanceSetupBtn.addEventListener('click', async () => {
    const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    const balanceSnap = await getDoc(balanceRef);
    if (!balanceSnap.exists()) {
        await setDoc(balanceRef, { online: 0, cash: 0, initialOnline: 0, initialCash: 0 });
        await takeDailySnapshot(new Date(), { online: 0, cash: 0 });
    }
    showMainApp();
});

function getDateId(date) { return date.toISOString().split('T')[0]; }

async function takeDailySnapshot(date = new Date(), forceBalance) {
    if (!currentUser) return;
    const dateId = getDateId(date);
    const snapshotRef = doc(db, `users/${currentUser.uid}/daily_snapshots/${dateId}`);
    let closingBalance = forceBalance;
    if (!closingBalance) {
        const balanceDoc = await getDoc(doc(db, `users/${currentUser.uid}/balance/main`));
        closingBalance = balanceDoc.exists() ? balanceDoc.data() : { online: 0, cash: 0 };
    }
    await setDoc(snapshotRef, { closingOnline: closingBalance.online, closingCash: closingBalance.cash, timestamp: serverTimestamp() });
    localStorage.setItem(`lastSnapshot_${currentUser.uid}`, dateId);
}

datePicker.addEventListener('change', () => loadTransactionsAndReportForDate(datePicker.valueAsDate));

function loadDashboardData() {
    const balanceRef = doc(db, `users/${currentUser.uid}/balance/main`);
    onSnapshot(balanceRef, (doc) => {
        if (!doc.exists()) {
            ['online-balance', 'cash-balance', 'total-balance'].forEach(id => document.getElementById(id).textContent = '৳0.00');
            return;
        };
        const data = doc.data();
        document.getElementById('online-balance').textContent = `৳${data.online.toFixed(2)}`;
        document.getElementById('cash-balance').textContent = `৳${data.cash.toFixed(2)}`;
        document.getElementById('total-balance').textContent = `৳${(data.online + data.cash).toFixed(2)}`;
    });
}

async function loadTransactionsAndReportForDate(selectedDate) {
    if (!currentUser) return;
    const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999);
    
    const todayTransQuery = query(collection(db, `users/${currentUser.uid}/transactions`), where('timestamp', '>=', startOfDay), where('timestamp', '<=', endOfDay), orderBy('timestamp', 'desc'));
    onSnapshot(todayTransQuery, snapshot => {
        let dailyIncome = 0, dailyExpense = 0;
        const list = document.getElementById('transactions-list-ul'); list.innerHTML = '';
        snapshot.forEach(doc => {
            const t = doc.data();
            if (t.type === 'income') dailyIncome += t.amount;
            if (t.type === 'expense') dailyExpense += t.amount;
            list.innerHTML += `<li><div class="list-item-info"><span>${t.category}: ৳${t.amount} (${t.description})</span></div><div class="list-item-actions"><button class="delete-btn" data-id="${doc.id}" data-type="transaction">🗑️</button></div></li>`;
        });
        document.getElementById('daily-income').textContent = `৳${dailyIncome.toFixed(2)}`;
        document.getElementById('daily-expense').textContent = `৳${dailyExpense.toFixed(2)}`;
        const profitLoss = dailyIncome - dailyExpense;
        const profitLossEl = document.getElementById('profit-loss');
        profitLossEl.textContent = `৳${profitLoss.toFixed(2)}`;
        profitLossEl.style.color = profitLoss >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    });

    const previousDay = new Date(selectedDate);
    previousDay.setDate(previousDay.getDate() - 1);
    const prevDayId = getDateId(previousDay);
    const prevDaySnapshotDoc = await getDoc(doc(db, `users/${currentUser.uid}/daily_snapshots/${prevDayId}`));

    let openingOnline = 0, openingCash = 0;
    if (prevDaySnapshotDoc.exists()) {
        openingOnline = prevDaySnapshotDoc.data().closingOnline;
        openingCash = prevDaySnapshotDoc.data().closingCash;
    } else {
        const balanceDoc = await getDoc(doc(db, `users/${currentUser.uid}/balance/main`));
        if(balanceDoc.exists()) {
            openingOnline = balanceDoc.data().initialOnline || 0;
            openingCash = balanceDoc.data().initialCash || 0;
        }
    }
    document.getElementById('opening-balance').textContent = `৳${(openingOnline + openingCash).toFixed(2)}`;

    const todayId = getDateId(new Date());
    const selectedId = getDateId(selectedDate);
    if (todayId === selectedId) {
        const balanceDoc = await getDoc(doc(db, `users/${currentUser.uid}/balance/main`));
        if (balanceDoc.exists()) {
            const current = balanceDoc.data();
            document.getElementById('closing-balance').textContent = `অনলাইন: ৳${current.online.toFixed(2)} | ক্যাশ: ৳${current.cash.toFixed(2)}`;
        }
    } else {
        const selectedSnapshotDoc = await getDoc(doc(db, `users/${currentUser.uid}/daily_snapshots/${selectedId}`));
        if (selectedSnapshotDoc.exists()) {
            const snapshotData = selectedSnapshotDoc.data();
            document.getElementById('closing-balance').textContent = `অনলাইন: ৳${snapshotData.closingOnline.toFixed(2)} | ক্যাশ: ৳${snapshotData.closingCash.toFixed(2)}`;
        } else {
            document.getElementById('closing-balance').textContent = 'হিসাব নেই';
        }
    }
}

// *** CRITICAL UPDATE: Renders chart with CORRECT Y-Axis ***
async function renderMonthlyChart() {
    const mainCanvas = document.getElementById('monthly-chart');
    const yAxisCanvasLeft = document.getElementById('y-axis-chart-left');
    if (!mainCanvas || !yAxisCanvasLeft) return;

    const mainCtx = mainCanvas.getContext('2d');
    const yAxisCtxLeft = yAxisCanvasLeft.getContext('2d');

    if (window.chartInstances) {
        window.chartInstances.forEach(instance => instance.destroy());
    }
    
    const labels = [], onlineData = [], cashData = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('bn-BD', {day: 'numeric', month: 'short'}));
        const dateId = getDateId(d);
        const snapshotDoc = await getDoc(doc(db, `users/${currentUser.uid}/daily_snapshots/${dateId}`));
        if (snapshotDoc.exists()) {
            onlineData.push(snapshotDoc.data().closingOnline);
            cashData.push(snapshotDoc.data().closingCash);
        } else {
            onlineData.push(null);
            cashData.push(null);
        }
    }

    const chartData = {
        labels,
        datasets: [
            { label: 'অনলাইন ব্যালেন্স', data: onlineData, borderColor: '#2196F3', backgroundColor: 'rgba(33, 150, 243, 0.1)', fill: true, tension: 0.2, spanGaps: true },
            { label: 'ক্যাশ ব্যালেন্স', data: cashData, borderColor: '#4CAF50', backgroundColor: 'rgba(76, 175, 80, 0.1)', fill: true, tension: 0.2, spanGaps: true }
        ]
    };

    // Calculate nice tick values for the Y-Axis
    const allData = onlineData.concat(cashData).filter(v => v !== null);
    const maxVal = allData.length > 0 ? Math.max(...allData) : 1000;
    const yAxisOptions = {
        responsive: true, maintainAspectRatio: false,
        scales: { 
            y: { 
                display: true, 
                beginAtZero: true, 
                max: Math.ceil(maxVal / 1000) * 1000 + 5000, // Make it a bit taller
                ticks: { 
                    padding: 10,
                    // Format ticks to be more readable (e.g., 5k, 10k)
                    callback: function(value, index, values) {
                        if (value >= 1000) {
                            return (value / 1000) + 'k';
                        }
                        return value;
                    }
                } 
            }, 
            x: { display: false } 
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        elements: { point: { radius: 0 }, line: { borderWidth: 0 } }
    };
    
    // Create Left Y-Axis Chart
    const yAxisChartLeft = new Chart(yAxisCtxLeft, { type: 'line', data: chartData, options: yAxisOptions });
    
    // Create Main Chart
    const mainChart = new Chart(mainCtx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { 
                y: { display: false, max: yAxisOptions.scales.y.max }, // Use same max value
                x: { grid: { display: true }, ticks: { autoSkip: false } } 
            },
            plugins: { 
                legend: { display: true, position: 'top', align: 'start', labels: { boxWidth: 20, padding: 20 } }, 
                tooltip: { mode: 'index', intersect: false } 
            }
        }
    });

    window.chartInstances = [mainChart, yAxisChartLeft];

    const chartWrapper = document.querySelector('.chart-container-wrapper');
    if (chartWrapper) {
        chartWrapper.scrollLeft = chartWrapper.scrollWidth;
    }
}


categorySelect.addEventListener('change', () => { personDetailsDiv.style.display = ['due', 'payable'].includes(categorySelect.value) ? 'block' : 'none'; });

document.getElementById('add-transaction-btn').addEventListener('click', async () => {
    const category = categorySelect.value;
    const amount = parseFloat(document.getElementById('amount').value);
    const description = document.getElementById('description').value;
    const person = personNameInput.value;
    const phone = personPhoneInput.value;
    if (!amount || amount <= 0) return alert('সঠিক পরিমাণ দিন।');
    
    const isDueOrPayable = ['due', 'payable'].includes(category);
    if(isDueOrPayable && !person) return alert('ব্যক্তির নাম দিন।');
    
    if (isDueOrPayable) {
        const collectionName = category === 'due' ? 'dues' : 'payables';
        const nameField = category === 'due' ? 'customerName' : 'personName';
        const q = query(collection(db, `users/${currentUser.uid}/${collectionName}`), where(nameField, '==', person), where('status', '!=', 'paid'));
        const existingEntrySnap = await getDocs(q);
        let entryRef = existingEntrySnap.empty ? doc(collection(db, `users/${currentUser.uid}/${collectionName}`)) : existingEntrySnap.docs[0].ref;
        try {
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(entryRef);
                const data = { name: description || 'N/A', amount, date: serverTimestamp() };
                if (!docSnap.exists()) {
                    const newEntry = { status: 'unpaid', paidAmount: 0, totalAmount: amount, remainingAmount: amount, lastUpdatedAt: serverTimestamp(), phoneNumber: phone };
                    newEntry[nameField] = person;
                    transaction.set(entryRef, newEntry);
                } else {
                    const newTotal = docSnap.data().totalAmount + amount;
                    const newRemaining = docSnap.data().remainingAmount + amount;
                    const updateData = { totalAmount: newTotal, remainingAmount: newRemaining, lastUpdatedAt: serverTimestamp() };
                    if (phone) updateData.phoneNumber = phone;
                    transaction.update(entryRef, updateData);
                }
                transaction.set(doc(collection(entryRef, 'items')), data);
            });
        } catch (e) { console.error("Transaction failed: ", e); alert("এন্ট্রি যোগ করতে সমস্যা হয়েছে। Firebase Index তৈরি করেছেন কি?"); }
    } else {
        await addDoc(collection(db, `users/${currentUser.uid}/transactions`), { category, amount, description, type: category.includes('income')?'income':'expense', timestamp: serverTimestamp() });
        const balanceRef = doc(db, `users/${currentUser.uid}/balance/main`);
        await runTransaction(db, async (t) => {
            const balanceDoc = await t.get(balanceRef);
            if (!balanceDoc.exists()) throw "Balance doc not found";
            const b = balanceDoc.data();
            if (category === 'online-income') b.online += amount; else if (category === 'cash-income') b.cash += amount;
            else if (category === 'online-expense') b.online -= amount; else if (category === 'cash-expense') b.cash -= amount;
            t.update(balanceRef, b);
        });
    }
    transactionForm.reset(); personDetailsDiv.style.display = 'none';
    await takeDailySnapshot();
    loadTransactionsAndReportForDate(datePicker.valueAsDate);
    renderMonthlyChart();
});

function loadAllDuesAndPayables() {
    const renderList = (collectionName, listId) => {
        const nameField = collectionName === 'dues' ? 'customerName' : 'personName';
        const q = query(collection(db, `users/${currentUser.uid}/${collectionName}`), where('status', '!=', 'paid'), orderBy(nameField));
        onSnapshot(q, snapshot => {
            const list = document.getElementById(listId); list.innerHTML = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                const phoneButtons = data.phoneNumber ? `<button class="whatsapp-btn" title="Send WhatsApp Message">💬</button><button class="sms-btn" title="Send SMS">✉️</button>` : '';
                list.innerHTML += `<li data-id="${doc.id}" data-type="${collectionName}" data-phone="${data.phoneNumber || ''}" data-name="${data[nameField]}" data-amount="${data.remainingAmount}">
                        <div class="list-item-info"><strong>${data[nameField]}</strong><br><small>${collectionName === 'dues' ? 'বাকি' : 'দিতে হবে'}: ৳${data.remainingAmount.toFixed(2)}</small></div>
                        <div class="list-item-actions">${phoneButtons}<button class="view-due-btn">বিস্তারিত</button></div>
                    </li>`;
            });
        });
    };
    renderList('dues', 'due-list-ul');
    renderList('payables', 'payable-list-ul');
}

function setupMessagingListeners(listId) {
    document.getElementById(listId).addEventListener('click', async e => {
        const button = e.target.closest('button');
        if (!button || (!button.classList.contains('whatsapp-btn') && !button.classList.contains('sms-btn'))) return;
        
        const listItem = e.target.closest('li');
        let phone = listItem.dataset.phone;
        const name = listItem.dataset.name;
        const amount = listItem.dataset.amount;
        const entryId = listItem.dataset.id;
        const entryType = listItem.dataset.type;

        if (!phone) return alert("এই ব্যক্তির জন্য কোনো ফোন নম্বর সেভ করা নেই।");
        
        phone = phone.replace(/[^0-9+]/g, '');
        if (phone.startsWith('+')) { phone = phone.replace(/\s/g, ''); }
        else {
            if (phone.length === 11 && phone.startsWith('0')) { phone = `88${phone.substring(1)}`; }
            else if (phone.length === 10) { phone = `91${phone}`; }
        }
        
        const entryRef = doc(db, `users/${currentUser.uid}/${entryType}/${entryId}`);
        const itemsQuery = query(collection(entryRef, 'items'), orderBy('date', 'desc'));
        const itemsSnap = await getDocs(itemsQuery);
        
        let itemsList = itemsSnap.docs.map(doc => {
            const item = doc.data();
            return `${item.name} - ৳${item.amount}`;
        }).join('\n');
        
        const entrySnap = await getDoc(entryRef);
        const totalAmount = entrySnap.data().totalAmount;
        const paidAmount = entrySnap.data().paidAmount;

        const message = `নমস্কার ${name},\n\nআপনার হিসাবের বিবরণ:\n${itemsList}\n--------------------\nমোট: ৳${totalAmount}\nজমা: ৳${paidAmount}\n--------------------\nবাকি: ৳${amount}\n\nঅনুগ্রহ করে সময়মতো পরিশোধ করার অনুরোধ রইল।\nধন্যবাদ।`;
        const encodedMessage = encodeURIComponent(message);
        
        if (button.classList.contains('whatsapp-btn')) {
            window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
        } else if (button.classList.contains('sms-btn')) {
            window.location.href = `sms:${phone}?body=${encodedMessage}`;
        }
    });
}
setupMessagingListeners('due-list-ul');
setupMessagingListeners('payable-list-ul');

function setupModalEventListeners(listId) {
    document.getElementById(listId).addEventListener('click', e => {
        if (!e.target.classList.contains('view-due-btn')) return;
        const listItem = e.target.closest('li');
        currentOpenEntryId = listItem.dataset.id;
        currentOpenEntryType = listItem.dataset.type;
        const entryRef = doc(db, `users/${currentUser.uid}/${currentOpenEntryType}/${currentOpenEntryId}`);
        onSnapshot(entryRef, d => {
            if (!d.exists()) { modal.style.display = 'none'; return; }
            const data = d.data();
            const name = data.customerName || data.personName;
            document.getElementById('modal-person-name').textContent = name;
            document.getElementById('modal-total').textContent = `৳${data.totalAmount.toFixed(2)}`;
            document.getElementById('modal-paid').textContent = `৳${data.paidAmount.toFixed(2)}`;
            document.getElementById('modal-remaining').textContent = `৳${data.remainingAmount.toFixed(2)}`;
            const itemsQuery = query(collection(entryRef, 'items'), orderBy('date', 'desc'));
            onSnapshot(itemsQuery, i_snap => {
                const itemListUl = document.getElementById('modal-item-list'); itemListUl.innerHTML = '';
                i_snap.forEach(i_doc => { const item = i_doc.data(); const dateStr = item.date ? item.date.toDate().toLocaleDateString() : ''; itemListUl.innerHTML += `<li><span>${item.name} <small>(${dateStr})</small></span><span>৳${item.amount.toFixed(2)}</span></li>`; });
            });
            const paymentsQuery = query(collection(entryRef, 'payments'), orderBy('paymentDate', 'desc'));
            onSnapshot(paymentsQuery, p_snap => {
                const historyUl = document.getElementById('modal-payment-history'); historyUl.innerHTML = '';
                p_snap.forEach(p_doc => { const p = p_doc.data(); if (p.paymentDate) { historyUl.innerHTML += `<li>${p.paymentDate.toDate().toLocaleDateString()}: ৳${p.amount.toFixed(2)}</li>`; } });
            });
        });
        modal.style.display = 'block';
    });
}
setupModalEventListeners('due-list-ul');
setupModalEventListeners('payable-list-ul');

document.querySelector('.close-btn').onclick = () => modal.style.display = 'none';

document.getElementById('add-item-btn').addEventListener('click', async () => {
    const itemName = document.getElementById('new-item-name').value;
    const itemAmount = parseFloat(document.getElementById('new-item-amount').value);
    if (!itemName || !itemAmount || itemAmount <= 0) return alert('সঠিক আইটেম ও দাম দিন।');
    const entryRef = doc(db, `users/${currentUser.uid}/${currentOpenEntryType}/${currentOpenEntryId}`);
    await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(entryRef);
        if (!docSnap.exists()) throw "Entry does not exist!";
        const newTotal = docSnap.data().totalAmount + itemAmount;
        const newRemaining = docSnap.data().remainingAmount + itemAmount;
        transaction.update(entryRef, { totalAmount: newTotal, remainingAmount: newRemaining, lastUpdatedAt: serverTimestamp() });
        const newItemRef = doc(collection(entryRef, 'items'));
        transaction.set(newItemRef, { name: itemName, amount: itemAmount, date: serverTimestamp() });
    });
    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-amount').value = '';
});

document.getElementById('add-payment-btn').addEventListener('click', async () => {
    const paymentAmount = parseFloat(document.getElementById('new-payment-amount').value);
    const entryRef = doc(db, `users/${currentUser.uid}/${currentOpenEntryType}/${currentOpenEntryId}`);
    try {
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(entryRef);
            if (!docSnap.exists()) throw "Entry does not exist!";
            if (!paymentAmount || paymentAmount <= 0 || paymentAmount > docSnap.data().remainingAmount) throw new Error("সঠিক পেমেন্টের পরিমাণ দিন");
            const newPaid = docSnap.data().paidAmount + paymentAmount;
            const newRemaining = docSnap.data().remainingAmount - paymentAmount;
            transaction.update(entryRef, { paidAmount: newPaid, remainingAmount: newRemaining, status: newRemaining <= 0 ? 'paid' : 'partially-paid', lastUpdatedAt: serverTimestamp() });
            const newPaymentRef = doc(collection(entryRef, 'payments'));
            transaction.set(newPaymentRef, { amount: paymentAmount, paymentDate: serverTimestamp() });
        });
        document.getElementById('new-payment-amount').value = '';
    } catch (e) { alert(e.message); }
});

mainApp.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button || !button.classList.contains('delete-btn')) return;
    const listItem = button.closest('li');
    if(!listItem) return;
    const id = listItem.dataset.id; 
    const type = listItem.dataset.type;
    if (!id || !type || !confirm("আপনি কি এই লেনদেনটি মুছে ফেলতে নিশ্চিত?")) return;
    if (type === 'transaction') {
        const transRef = doc(db, `users/${currentUser.uid}/transactions/${id}`);
        const balanceRef = doc(db, `users/${currentUser.uid}/balance/main`);
        try {
            await runTransaction(db, async (t) => {
                const transDoc = await t.get(transRef);
                const balanceDoc = await t.get(balanceRef);
                if (!transDoc.exists() || !balanceDoc.exists()) throw "Document not found";
                const tData = transDoc.data();
                const bData = balanceDoc.data();
                if (tData.category === 'online-income') bData.online -= tData.amount;
                else if (tData.category === 'cash-income') bData.cash -= tData.amount;
                else if (tData.category === 'online-expense') bData.online += tData.amount;
                else if (tData.category === 'cash-expense') bData.cash += tData.amount;
                t.update(balanceRef, bData);
                t.delete(transRef);
            });
            await takeDailySnapshot();
            loadTransactionsAndReportForDate(datePicker.valueAsDate);
            renderMonthlyChart();
        } catch (error) { console.error("Error deleting transaction:", error); alert("লেনদেনটি মুছতে সমস্যা হয়েছে।"); }
    }
});
