import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, getDocs, collection, query, onSnapshot, deleteDoc, updateDoc, where, serverTimestamp, enableIndexedDbPersistence, writeBatch, orderBy, runTransaction, increment } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Service Worker & Firebase Initialization
if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js')); }
const firebaseConfig = { apiKey: "AIzaSyCESxz9Tyc0GvcY5PfWcPda0kArYb_6Jvg", authDomain: "new-hisab-khata.firebaseapp.com", projectId: "new-hisab-khata", storageBucket: "new-hisab-khata.firebasestorage.app", appId: "1:116945944640:web:8d944c18a0e4daaee19fa5" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
enableIndexedDbPersistence(db).catch(err => console.error("Persistence error: ", err.code));

// DOM Elements
const authContainer = document.getElementById('auth-container'), appContainer = document.getElementById('app-container'), setupScreen = document.getElementById('setup-screen'), mainApp = document.getElementById('main-app'), loginBtn = document.getElementById('login-btn'), signupLink = document.getElementById('signup-link'), logoutBtn = document.getElementById('logout-btn'), emailInput = document.getElementById('email'), passwordInput = document.getElementById('password'), datePicker = document.getElementById('date-picker'), categorySelect = document.getElementById('category'), personNameInput = document.getElementById('person-name'), personPhoneInput = document.getElementById('person-phone'), personDetailsDiv = document.getElementById('person-details'), transactionForm = document.getElementById('transaction-form'), modal = document.getElementById('details-modal'), customerModal = document.getElementById('customer-details-modal');
let currentUser, currentOpenEntryId, currentOpenEntryType, hasCheckedBalance = false;
window.chartInstances = [];
let allCustomersCache = [];
let allTransactionsCache = [];

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
            const currentData = balanceSnap.data();
            document.getElementById('initial-online-balance').value = currentData.online || 0;
            document.getElementById('initial-cash-balance').value = currentData.cash || 0;
            document.getElementById('initial-wallet-balance').value = currentData.wallet || 0;
        } else {
            document.getElementById('initial-online-balance').value = '';
            document.getElementById('initial-cash-balance').value = '';
            document.getElementById('initial-wallet-balance').value = '';
        }
        setupScreen.style.display = 'block';
        mainApp.style.display = 'none';
    } catch (error) { console.error("Error during initial checks:", error); setupScreen.style.display = 'block'; mainApp.style.display = 'none'; }
}

async function showMainApp() {
    setupScreen.style.display = 'none'; mainApp.style.display = 'block';
    if(datePicker) {
        datePicker.valueAsDate = new Date();
        await fetchAllTransactionsOnce();
        loadDashboardData();
        loadTransactionsAndReportForDate(datePicker.valueAsDate); 
        loadAllDuesAndPayables();
        loadAllCustomers();
        renderMonthlyChart();
    }
}

const saveInitialBalanceBtn = document.getElementById('save-initial-balance');
const skipBalanceSetupBtn = document.getElementById('skip-balance-setup');
saveInitialBalanceBtn.addEventListener('click', async () => {
    const online = parseFloat(document.getElementById('initial-online-balance').value);
    const cash = parseFloat(document.getElementById('initial-cash-balance').value);
    const wallet = parseFloat(document.getElementById('initial-wallet-balance').value);

    if(isNaN(online) || isNaN(cash) || isNaN(wallet)){
        alert("Please enter valid numbers for all balance fields.");
        return;
    }

    const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    const balanceSnap = await getDoc(balanceRef);

    if (balanceSnap.exists()){
        await updateDoc(balanceRef, { online, cash, wallet });
    } else {
        await setDoc(balanceRef, { online, cash, wallet, initialOnline: online, initialCash: cash, initialWallet: wallet });
    }
    await takeDailySnapshot(new Date(), { online, cash, wallet });
    showMainApp();
});
skipBalanceSetupBtn.addEventListener('click', async () => {
    const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    const balanceSnap = await getDoc(balanceRef);
    if (!balanceSnap.exists()) {
        await setDoc(balanceRef, { online: 0, cash: 0, wallet: 0, initialOnline: 0, initialCash: 0, initialWallet: 0 });
        await takeDailySnapshot(new Date(), { online: 0, cash: 0, wallet: 0 });
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
        closingBalance = balanceDoc.exists() ? balanceDoc.data() : { online: 0, cash: 0, wallet: 0 };
    }
    await setDoc(snapshotRef, { 
        closingOnline: closingBalance.online, 
        closingCash: closingBalance.cash,
        closingWallet: closingBalance.wallet,
        timestamp: serverTimestamp() 
    });
    localStorage.setItem(`lastSnapshot_${currentUser.uid}`, dateId);
}

datePicker.addEventListener('change', () => loadTransactionsAndReportForDate(datePicker.valueAsDate));

function loadDashboardData() {
    const balanceRef = doc(db, `users/${currentUser.uid}/balance/main`);
    onSnapshot(balanceRef, (doc) => {
        if (!doc.exists()) {
            ['online-balance', 'cash-balance', 'wallet-balance', 'total-balance'].forEach(id => document.getElementById(id).textContent = '৳0.00');
            return;
        };
        const data = doc.data();
        document.getElementById('online-balance').textContent = `৳${(data.online || 0).toFixed(2)}`;
        document.getElementById('cash-balance').textContent = `৳${(data.cash || 0).toFixed(2)}`;
        document.getElementById('wallet-balance').textContent = `৳${(data.wallet || 0).toFixed(2)}`;
        document.getElementById('total-balance').textContent = `৳${((data.online || 0) + (data.cash || 0) + (data.wallet || 0)).toFixed(2)}`;
    });
}

async function loadTransactionsAndReportForDate(selectedDate) {
    if (!currentUser) return;
    const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999);
    
    const balanceDoc = await getDoc(doc(db, `users/${currentUser.uid}/balance/main`));
    const initialBalance = balanceDoc.exists() ? { 
        online: balanceDoc.data().initialOnline || 0, 
        cash: balanceDoc.data().initialCash || 0,
        wallet: balanceDoc.data().initialWallet || 0
    } : { online: 0, cash: 0, wallet: 0 };
    
    let openingOnline = initialBalance.online;
    let openingCash = initialBalance.cash;
    let openingWallet = initialBalance.wallet;

    allTransactionsCache.forEach(t => {
        if (t.timestamp.toDate() < startOfDay) {
            if (t.category === 'online-income') openingOnline += t.amount;
            else if (t.category === 'cash-income') openingCash += t.amount;
            else if (t.category === 'wallet-income') openingWallet += t.amount;
            else if (t.category === 'online-expense') openingOnline -= t.amount;
            else if (t.category === 'cash-expense') openingCash -= t.amount;
            else if (t.category === 'wallet-expense') openingWallet -= t.amount;
        }
    });
    
    document.getElementById('opening-balance').textContent = `৳${(openingOnline + openingCash + openingWallet).toFixed(2)}`;

    let runningOnline = openingOnline;
    let runningCash = openingCash;
    let runningWallet = openingWallet;
    let dailyIncome = 0, dailyExpense = 0;
    const list = document.getElementById('transactions-list-ul');
    list.innerHTML = '';

    const todaysTransactions = allTransactionsCache
        .filter(t => t.timestamp.toDate() >= startOfDay && t.timestamp.toDate() <= endOfDay)
        .sort((a, b) => a.timestamp.seconds - b.timestamp.seconds);
    
    todaysTransactions.forEach(t => {
        if (t.type === 'income') dailyIncome += t.amount;
        if (t.type === 'expense') dailyExpense += t.amount;

        if (t.category.includes('online')) runningOnline += (t.type === 'income' ? t.amount : -t.amount);
        if (t.category.includes('cash')) runningCash += (t.type === 'income' ? t.amount : -t.amount);
        if (t.category.includes('wallet')) runningWallet += (t.type === 'income' ? t.amount : -t.amount);

        let balanceHtml = '';
        if (t.category.includes('online')) balanceHtml = `<span>Online: ৳${runningOnline.toFixed(2)}</span>`;
        else if (t.category.includes('cash')) balanceHtml = `<span>Cash: ৳${runningCash.toFixed(2)}</span>`;
        else if (t.category.includes('wallet')) balanceHtml = `<span>Wallet: ৳${runningWallet.toFixed(2)}</span>`;
        
        list.innerHTML += `
            <li data-id="${t.id}" data-type="transaction">
                <div class="transaction-item-details">
                    <span>${t.description}</span>
                    <small style="color: ${t.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)'};">
                        ${t.type === 'income' ? '+' : '-'} ৳${t.amount.toFixed(2)} (${t.category})
                    </small>
                </div>
                <div class="transaction-item-balance">
                    ${balanceHtml}
                    <button class="delete-btn">🗑️</button>
                </div>
            </li>`;
    });

    document.getElementById('daily-income').textContent = `৳${dailyIncome.toFixed(2)}`;
    document.getElementById('daily-expense').textContent = `৳${dailyExpense.toFixed(2)}`;
    const profitLoss = dailyIncome - dailyExpense;
    const profitLossEl = document.getElementById('profit-loss');
    profitLossEl.textContent = `৳${profitLoss.toFixed(2)}`;
    profitLossEl.style.color = profitLoss >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    
    const todayId = getDateId(new Date());
    const selectedId = getDateId(selectedDate);
    if (todayId === selectedId) {
        if (balanceDoc.exists()) {
            const current = balanceDoc.data();
            document.getElementById('closing-balance').textContent = `অনলাইন: ৳${(current.online||0).toFixed(2)} | ক্যাশ: ৳${(current.cash||0).toFixed(2)} | ওয়ালেট: ৳${(current.wallet||0).toFixed(2)}`;
        }
    } else {
        const selectedSnapshotDoc = await getDoc(doc(db, `users/${currentUser.uid}/daily_snapshots/${selectedId}`));
        if (selectedSnapshotDoc.exists()) {
            const d = selectedSnapshotDoc.data();
            document.getElementById('closing-balance').textContent = `অনলাইন: ৳${(d.closingOnline||0).toFixed(2)} | ক্যাশ: ৳${(d.closingCash||0).toFixed(2)} | ওয়ালেট: ৳${(d.closingWallet||0).toFixed(2)}`;
        } else {
            document.getElementById('closing-balance').textContent = 'হিসাব নেই';
        }
    }
}

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
        const d = new Date(); d.setDate(d.getDate() - i);
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
    
    const allData = onlineData.concat(cashData).filter(v => typeof v === 'number' && !isNaN(v));
    const maxVal = allData.length > 0 ? Math.max(...allData) : 0;
    const yAxisMax = (Math.ceil(maxVal / 5000) || 0) * 5000 + 5000;

    const yAxisOptions = {
        responsive: true, maintainAspectRatio: false,
        scales: { 
            y: { 
                display: true, 
                beginAtZero: true, 
                max: yAxisMax,
                ticks: { 
                    padding: 10,
                    stepSize: 5000,
                    callback: function(value) {
                        if (typeof value !== 'number') return '';
                        if (value >= 1000) return (value / 1000) + 'k';
                        return value;
                    }
                } 
            }, 
            x: { display: false } 
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        elements: { point: { radius: 0 }, line: { borderWidth: 0 } }
    };
    
    const yAxisChartLeft = new Chart(yAxisCtxLeft, { type: 'line', data: chartData, options: yAxisOptions });
    const mainChart = new Chart(mainCtx, {
        type: 'line', data: chartData,
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { display: false, max: yAxisMax }, x: { grid: { display: true }, ticks: { autoSkip: false } } },
            plugins: { legend: { display: true, position: 'top', align: 'start', labels: { boxWidth: 20, padding: 20 } }, tooltip: { mode: 'index', intersect: false } }
        }
    });

    window.chartInstances = [mainChart, yAxisChartLeft];
    const chartWrapper = document.querySelector('.chart-container-wrapper');
    if (chartWrapper) {
        chartWrapper.scrollLeft = chartWrapper.scrollWidth;
    }
}

async function findOrCreateCustomer(name, phone) {
    const standardizedName = name.trim().toLowerCase();
    const customerQuery = query(collection(db, `users/${currentUser.uid}/customers`), where('searchableName', '==', standardizedName));
    const querySnapshot = await getDocs(customerQuery);
    let customerRef;
    if (querySnapshot.empty) {
        customerRef = doc(collection(db, `users/${currentUser.uid}/customers`));
        await setDoc(customerRef, { name: name.trim(), searchableName: standardizedName, phone: phone || '', totalDueAmount: 0, totalPaidAmount: 0, currentDue: 0, lastActivity: serverTimestamp() });
    } else {
        customerRef = querySnapshot.docs[0].ref;
        if (phone) { await updateDoc(customerRef, { phone }); }
    }
    return customerRef;
}

categorySelect.addEventListener('change', () => { personDetailsDiv.style.display = ['due', 'payable'].includes(categorySelect.value) ? 'block' : 'none'; });

document.getElementById('add-transaction-btn').addEventListener('click', async () => {
    const category = categorySelect.value;
    const amount = parseFloat(document.getElementById('amount').value);
    const description = document.getElementById('description').value;
    const person = personNameInput.value.trim();
    const phone = personPhoneInput.value;
    if (!amount || amount <= 0) return alert('সঠিক পরিমাণ দিন।');
    
    const isDueOrPayable = ['due', 'payable'].includes(category);
    if(isDueOrPayable && !person) return alert('ব্যক্তির নাম দিন।');
    
    if (isDueOrPayable) {
        const collectionName = category === 'due' ? 'dues' : 'payables';
        const nameField = category === 'due' ? 'customerName' : 'personName';
        const customerRef = collectionName === 'dues' ? await findOrCreateCustomer(person, phone) : null;
        const q = query(collection(db, `users/${currentUser.uid}/${collectionName}`), where(nameField, '==', person), where('status', 'in', ['unpaid', 'partially-paid']));
        const existingEntrySnap = await getDocs(q);
        let entryRef = existingEntrySnap.empty ? doc(collection(db, `users/${currentUser.uid}/${collectionName}`)) : existingEntrySnap.docs[0].ref;
        try {
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(entryRef);
                const data = { name: description || 'N/A', amount, date: serverTimestamp() };
                if (!docSnap.exists()) {
                    const newEntry = { status: 'unpaid', paidAmount: 0, totalAmount: amount, remainingAmount: amount, lastUpdatedAt: serverTimestamp(), phoneNumber: phone, };
                    newEntry[nameField] = person;
                    if(customerRef) newEntry.customerId = customerRef.id;
                    transaction.set(entryRef, newEntry);
                } else {
                    const newTotal = docSnap.data().totalAmount + amount;
                    const newRemaining = docSnap.data().remainingAmount + amount;
                    const updateData = { totalAmount: newTotal, remainingAmount: newRemaining, lastUpdatedAt: serverTimestamp() };
                    if (phone && !docSnap.data().phoneNumber) updateData.phoneNumber = phone;
                    transaction.update(entryRef, updateData);
                }
                transaction.set(doc(collection(entryRef, 'items')), data);
                if(customerRef){
                    transaction.update(customerRef, { totalDueAmount: increment(amount), currentDue: increment(amount), lastActivity: serverTimestamp() });
                }
            });
        } catch (e) { console.error("Transaction failed: ", e); }
    } else {
        await addDoc(collection(db, `users/${currentUser.uid}/transactions`), { category, amount, description, type: category.includes('income')?'income':'expense', timestamp: serverTimestamp() });
        const balanceRef = doc(db, `users/${currentUser.uid}/balance/main`);
        await runTransaction(db, async (t) => {
            const balanceDoc = await t.get(balanceRef);
            if (!balanceDoc.exists()) throw "Balance doc not found";
            const b = balanceDoc.data();
            if (category === 'online-income') b.online = (b.online || 0) + amount;
            else if (category === 'cash-income') b.cash = (b.cash || 0) + amount;
            else if (category === 'wallet-income') b.wallet = (b.wallet || 0) + amount;
            else if (category === 'online-expense') b.online = (b.online || 0) - amount;
            else if (category === 'cash-expense') b.cash = (b.cash || 0) - amount;
            else if (category === 'wallet-expense') b.wallet = (b.wallet || 0) - amount;
            t.update(balanceRef, b);
        });
    }
    transactionForm.reset(); personDetailsDiv.style.display = 'none';
    await fetchAllTransactionsOnce();
    await takeDailySnapshot();
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

function loadAllCustomers() {
    const q = query(collection(db, `users/${currentUser.uid}/customers`), orderBy('lastActivity', 'desc'));
    onSnapshot(q, snapshot => {
        const list = document.getElementById('customer-list-ul');
        list.innerHTML = '';
        allCustomersCache = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            allCustomersCache.push(data.name);
            list.innerHTML += `
                <li class="customer-list-item" data-id="${doc.id}">
                    <div class="list-item-info customer-info-clickable">
                        <strong>${data.name}</strong>
                        <div class="customer-summary">
                            <span>মোট ডিউ: ৳${(data.totalDueAmount || 0).toFixed(2)}</span>
                            <span>পরিশোধ: ৳${(data.totalPaidAmount || 0).toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="list-item-actions">
                         <strong style="color: ${data.currentDue > 0 ? 'var(--accent-red)' : 'var(--accent-green)'};">বাকি: ৳${(data.currentDue || 0).toFixed(2)}</strong>
                         <button class="delete-btn customer-delete-btn" title="কাস্টমার ডিলিট করুন">🗑️</button>
                    </div>
                </li>`;
        });
        autocomplete(personNameInput, allCustomersCache);
    });
}

function autocomplete(inp, arr) {
    let currentFocus;
    inp.addEventListener("input", function(e) {
        let a, b, i, val = this.value;
        closeAllLists();
        if (!val) { return false;}
        currentFocus = -1;
        a = document.createElement("DIV");
        a.setAttribute("id", this.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-items");
        this.parentNode.appendChild(a);
        for (i = 0; i < arr.length; i++) {
            if (arr[i].substr(0, val.length).toUpperCase() == val.toUpperCase()) {
                b = document.createElement("DIV");
                b.innerHTML = "<strong>" + arr[i].substr(0, val.length) + "</strong>";
                b.innerHTML += arr[i].substr(val.length);
                b.innerHTML += "<input type='hidden' value='" + arr[i] + "'>";
                b.addEventListener("click", function(e) {
                    inp.value = this.getElementsByTagName("input")[0].value;
                    closeAllLists();
                });
                a.appendChild(b);
            }
        }
    });
    function closeAllLists(elmnt) {
        var x = document.getElementsByClassName("autocomplete-items");
        for (var i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != inp) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
    }
    document.addEventListener("click", function (e) {
        closeAllLists(e.target);
    });
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
        const itemsQuery = query(collection(entryRef, 'items'), orderBy('date', 'asc'));
        const itemsSnap = await getDocs(itemsQuery);
        
        let itemsList = itemsSnap.docs.map(doc => {
            const item = doc.data();
            const itemDate = item.date ? `(${item.date.toDate().toLocaleDateString()})` : '';
            return `${item.name} ${itemDate} - ৳${item.amount}`;
        }).join('\n');
        
        const entrySnap = await getDoc(entryRef);
        const totalAmount = entrySnap.data().totalAmount;
        const paidAmount = entrySnap.data().paidAmount;

        let message = '';
        if (entryType === 'dues') {
            message = `নমস্কার ${name},\n\nআপনার হিসাবের বিবরণ:\n${itemsList}\n--------------------\nমোট: ৳${totalAmount}\nজমা: ৳${paidAmount}\n--------------------\nবাকি: ৳${amount}\n\nঅনুগ্রহ করে সময়মতো পরিশোধ করার অনুরোধ রইল।\nধন্যবাদ।`;
        } else {
            message = `নমস্কার ${name},\n\nআপনার সাথে আমার হিসাবের বিবরণ নিচে দেওয়া হলো:\n\n${itemsList}\n--------------------\nমোট পাওনা: ৳${totalAmount}\nআমি পরিশোধ করেছি: ৳${paidAmount}\n--------------------\nএখন আপনাকে আমার দিতে হবে: ৳${amount}\n\nধন্যবাদ।`;
        }
        
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
            document.getElementById('update-person-phone').value = data.phoneNumber || '';
            const itemsQuery = query(collection(entryRef, 'items'), orderBy('date', 'desc'));
            onSnapshot(itemsQuery, i_snap => {
                const itemListUl = document.getElementById('modal-item-list'); itemListUl.innerHTML = '';
                i_snap.forEach(i_doc => {
                    const item = i_doc.data();
                    const dateStr = item.date ? item.date.toDate().toLocaleDateString() : '';
                    itemListUl.innerHTML += `<li data-item-id="${i_doc.id}" data-item-amount="${item.amount}">
                            <div class="list-item-info"><span>${item.name} <small>(${dateStr})</small></span><span>৳${item.amount.toFixed(2)}</span></div>
                            <div class="list-item-actions"><button class="delete-btn item-delete-btn">🗑️</button></div>
                        </li>`;
                });
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

document.querySelector('.close-btn').onclick = () => {modal.style.display = 'none'; customerModal.style.display = 'none'};
customerModal.querySelector('.close-btn').onclick = () => customerModal.style.display = 'none';

document.getElementById('customer-list-ul').addEventListener('click', async (e) => {
    const listItem = e.target.closest('li[data-id]');
    if (!listItem || e.target.closest('.delete-btn')) return;
    const customerId = listItem.dataset.id;
    const customerDoc = await getDoc(doc(db, `users/${currentUser.uid}/customers/${customerId}`));
    if(!customerDoc.exists()) return;
    document.getElementById('customer-modal-name').textContent = customerDoc.data().name;
    const historyList = document.getElementById('customer-modal-due-history');
    historyList.innerHTML = 'লোড হচ্ছে...';
    
    const duesQuery = query(collection(db, `users/${currentUser.uid}/dues`), where('customerId', '==', customerId), orderBy('lastUpdatedAt', 'desc'));
    onSnapshot(duesQuery, snapshot => {
        historyList.innerHTML = '';
        if(snapshot.empty){
            historyList.innerHTML = '<li>কোনো ডিউ-এর ইতিহাস পাওয়া যায়নি।</li>';
            return;
        }
        snapshot.forEach(async (d) => {
            const due = d.data();
            const statusClass = due.status === 'paid' ? 'paid' : '';
            
            const itemsQuery = query(collection(d.ref, 'items'), orderBy('date', 'asc'));
            const itemsSnap = await getDocs(itemsQuery);
            const itemsHtml = itemsSnap.docs.map(itemDoc => {
                const item = itemDoc.data();
                return `<li><span>${item.name}</span><span>৳${item.amount.toFixed(2)}</span></li>`;
            }).join('');

            historyList.innerHTML += `
                <li class="due-history-item ${statusClass}">
                    <div class="due-history-header">
                        <span><strong>মোট: ৳${due.totalAmount.toFixed(2)}</strong> (${new Date(due.lastUpdatedAt.seconds * 1000).toLocaleDateString()})</span>
                        <small>স্ট্যাটাস: ${due.status}</small>
                    </div>
                    <div class="due-history-item-details">
                        <strong>আইটেম:</strong>
                        <ul>${itemsHtml}</ul>
                        <strong>পরিশোধ:</strong> ৳${due.paidAmount.toFixed(2)}
                    </div>
                </li>`;
        });
    });
    customerModal.style.display = 'block';
});

document.getElementById('update-phone-btn').addEventListener('click', async () => {
    const newPhone = document.getElementById('update-person-phone').value;
    if (!currentOpenEntryId || !currentOpenEntryType) return;
    const entryRef = doc(db, `users/${currentUser.uid}/${currentOpenEntryType}/${currentOpenEntryId}`);
    try {
        await updateDoc(entryRef, { phoneNumber: newPhone });
        if (currentOpenEntryType === 'dues') {
            const entryDoc = await getDoc(entryRef);
            if(entryDoc.exists() && entryDoc.data().customerId) {
                const customerRef = doc(db, `users/${currentUser.uid}/customers/${entryDoc.data().customerId}`);
                await updateDoc(customerRef, { phone: newPhone });
            }
        }
        alert("Phone number updated successfully!");
    } catch (e) {
        console.error("Error updating phone number: ", e);
        alert("Phone number update failed.");
    }
});

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
        if (currentOpenEntryType === 'dues' && docSnap.data().customerId) {
            const customerRef = doc(db, `users/${currentUser.uid}/customers/${docSnap.data().customerId}`);
            transaction.update(customerRef, { totalDueAmount: increment(itemAmount), currentDue: increment(itemAmount), lastActivity: serverTimestamp() });
        }
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
            if (currentOpenEntryType === 'dues' && docSnap.data().customerId) {
                const customerRef = doc(db, `users/${currentUser.uid}/customers/${docSnap.data().customerId}`);
                transaction.update(customerRef, { totalPaidAmount: increment(paymentAmount), currentDue: increment(-paymentAmount), lastActivity: serverTimestamp() });
            }
        });
        document.getElementById('new-payment-amount').value = '';
        modal.style.display = 'none';
    } catch (e) { alert(e.message); }
});

mainApp.addEventListener('click', async (e) => {
    const button = e.target.closest('button.delete-btn');
    if (!button) return;
    
    const listItem = button.closest('li[data-id]');
    if(!listItem) return;
    
    const id = listItem.dataset.id; 
    let type = button.classList.contains('customer-delete-btn') ? 'customer' : listItem.dataset.type;
    
    if (!id || !type) return;

    if (type === 'transaction') {
        if (!confirm("আপনি কি এই লেনদেনটি মুছে ফেলতে নিশ্চিত?")) return;
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
                else if (tData.category === 'wallet-income') bData.wallet -= tData.amount;
                else if (tData.category === 'online-expense') bData.online += tData.amount;
                else if (tData.category === 'cash-expense') bData.cash += tData.amount;
                else if (tData.category === 'wallet-expense') bData.wallet += tData.amount;
                t.update(balanceRef, bData);
                t.delete(transRef);
            });
            await fetchAllTransactionsOnce();
            await takeDailySnapshot();
        } catch (error) { console.error("Error deleting transaction:", error); alert("লেনদেনটি মুছতে সমস্যা হয়েছে।"); }
    } else if (type === 'customer') {
        if (confirm("আপনি কি এই কাস্টমার এবং তার সমস্ত ডিউ-এর ইতিহাস মুছে ফেলতে নিশ্চিত? এই কাজটি ফেরানো যাবে না।")) {
            await deleteCustomer(id);
        }
    }
});

modal.addEventListener('click', async (e) => {
    const button = e.target.closest('button.item-delete-btn');
    if (!button) return;
    const listItem = button.closest('li');
    const itemId = listItem.dataset.itemId;
    const itemAmount = parseFloat(listItem.dataset.itemAmount);
    
    if (!itemId || !itemAmount) return alert("কিছু একটা সমস্যা হয়েছে।");
    if (!confirm(`আপনি কি এই আইটেমটি (৳${itemAmount}) মুছে ফেলতে এবং পেমেন্ট হিসেবে গণ্য করতে নিশ্চিত?`)) return;

    const entryRef = doc(db, `users/${currentUser.uid}/${currentOpenEntryType}/${currentOpenEntryId}`);
    const itemRef = doc(entryRef, 'items', itemId);

    try {
        await runTransaction(db, async (transaction) => {
            const entryDoc = await transaction.get(entryRef);
            if (!entryDoc.exists()) throw "Entry not found!";
            
            const newPaid = entryDoc.data().paidAmount + itemAmount;
            const newRemaining = entryDoc.data().remainingAmount - itemAmount;

            transaction.update(entryRef, {
                paidAmount: newPaid,
                remainingAmount: newRemaining,
                status: newRemaining <= 0 ? 'paid' : 'partially-paid',
                lastUpdatedAt: serverTimestamp()
            });

            const newPaymentRef = doc(collection(entryRef, 'payments'));
            transaction.set(newPaymentRef, {
                amount: itemAmount,
                paymentDate: serverTimestamp(),
                note: `Paid by clearing item: ${itemId}`
            });

            transaction.delete(itemRef);

            if (currentOpenEntryType === 'dues' && entryDoc.data().customerId) {
                const customerRef = doc(db, `users/${currentUser.uid}/customers/${entryDoc.data().customerId}`);
                transaction.update(customerRef, {
                    totalPaidAmount: increment(itemAmount),
                    currentDue: increment(-itemAmount),
                    lastActivity: serverTimestamp()
                });
            }
        });
    } catch (error) {
        console.error("Error deleting item:", error);
        alert("আইটেমটি মুছতে সমস্যা হয়েছে।");
    }
});

async function deleteCustomer(customerId) {
    if (!customerId) return;
    try {
        const customerRef = doc(db, `users/${currentUser.uid}/customers/${customerId}`);
        const duesQuery = query(collection(db, `users/${currentUser.uid}/dues`), where('customerId', '==', customerId));
        const duesSnap = await getDocs(duesQuery);
        const batch = writeBatch(db);
        for (const dueDoc of duesSnap.docs) {
            const itemsSnap = await getDocs(collection(dueDoc.ref, 'items'));
            itemsSnap.forEach(itemDoc => batch.delete(itemDoc.ref));
            const paymentsSnap = await getDocs(collection(dueDoc.ref, 'payments'));
            paymentsSnap.forEach(paymentDoc => batch.delete(paymentDoc.ref));
            batch.delete(dueDoc.ref);
        }
        batch.delete(customerRef);
        await batch.commit();
        alert("কাস্টমার সফলভাবে মুছে ফেলা হয়েছে।");
    } catch (error) {
        console.error("Error deleting customer: ", error);
        alert("কাস্টমার মুছতে সমস্যা হয়েছে।");
    }
}
