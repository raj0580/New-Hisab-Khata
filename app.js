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
const authContainer = document.getElementById('auth-container'), appContainer = document.getElementById('app-container'), setupScreen = document.getElementById('setup-screen'), mainApp = document.getElementById('main-app'), loginBtn = document.getElementById('login-btn'), signupLink = document.getElementById('signup-link'), logoutBtn = document.getElementById('logout-btn'), emailInput = document.getElementById('email'), passwordInput = document.getElementById('password'), datePicker = document.getElementById('date-picker'), categorySelect = document.getElementById('category'), personNameInput = document.getElementById('person-name'), transactionForm = document.getElementById('transaction-form'), saveInitialBalanceBtn = document.getElementById('save-initial-balance'), skipBalanceSetupBtn = document.getElementById('skip-balance-setup'), modal = document.getElementById('details-modal');
let currentUser, currentOpenEntryId, currentOpenEntryType, monthlyChart, hasCheckedBalance = false, allTransactionsCache = [];

// Auth State Logic
onAuthStateChanged(auth, user => {
    if (user) { currentUser = user; authContainer.style.display = 'none'; appContainer.style.display = 'block'; hasCheckedBalance = false; checkInitialBalance(); } 
    else { currentUser = null; authContainer.style.display = 'block'; appContainer.style.display = 'none'; }
});
loginBtn.addEventListener('click', () => signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value).catch(err => alert(err.message)));
signupLink.addEventListener('click', e => { e.preventDefault(); createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value).catch(err => alert(err.message)); });
logoutBtn.addEventListener('click', () => signOut(auth));

async function checkInitialBalance() {
    if (!currentUser || hasCheckedBalance) return;
    const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    try {
        const balanceSnap = await getDoc(balanceRef);
        hasCheckedBalance = true;
        balanceSnap.exists() ? showMainApp() : (setupScreen.style.display = 'block', mainApp.style.display = 'none');
    } catch (error) { console.error("Error checking balance:", error); setupScreen.style.display = 'block'; mainApp.style.display = 'none'; }
}

async function showMainApp() {
    setupScreen.style.display = 'none'; mainApp.style.display = 'block';
    if(datePicker) {
        datePicker.valueAsDate = new Date();
        await fetchAllTransactionsOnce();
        loadDashboardData();
        loadTransactionsAndReportForDate(datePicker.valueAsDate); 
        loadAllDuesAndPayables();
        renderMonthlyChart();
    }
}

saveInitialBalanceBtn.addEventListener('click', async () => {
    const online = parseFloat(document.getElementById('initial-online-balance').value) || 0;
    const cash = parseFloat(document.getElementById('initial-cash-balance').value) || 0;
    await setDoc(doc(db, 'users', currentUser.uid, 'balance', 'main'), { online, cash, initialOnline: online, initialCash: cash, createdAt: serverTimestamp() }); showMainApp();
});
skipBalanceSetupBtn.addEventListener('click', async () => {
    const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    const balanceSnap = await getDoc(balanceRef);
    if (!balanceSnap.exists()) { await setDoc(balanceRef, { online: 0, cash: 0, initialOnline: 0, initialCash: 0, createdAt: serverTimestamp() }); }
    showMainApp();
});

async function fetchAllTransactionsOnce() {
    if (!currentUser) return;
    const transactionsQuery = query(collection(db, `users/${currentUser.uid}/transactions`), orderBy('timestamp'));
    const transactionsSnap = await getDocs(transactionsQuery);
    allTransactionsCache = transactionsSnap.docs.map(d => ({id: d.id, ...d.data()}));
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

    const balanceDoc = await getDoc(doc(db, `users/${currentUser.uid}/balance/main`));
    const initialBalance = balanceDoc.exists() ? { online: balanceDoc.data().initialOnline || 0, cash: balanceDoc.data().initialCash || 0 } : { online: 0, cash: 0 };
    
    let openingOnline = initialBalance.online;
    let openingCash = initialBalance.cash;

    allTransactionsCache.forEach(t => {
        if (t.timestamp.toDate() < startOfDay) {
            if (t.category === 'online-income') openingOnline += t.amount;
            else if (t.category === 'cash-income') openingCash += t.amount;
            else if (t.category === 'online-expense') openingOnline -= t.amount;
            else if (t.category === 'cash-expense') openingCash -= t.amount;
        }
    });

    let dailyIncome = 0, dailyExpense = 0;
    const list = document.getElementById('transactions-list-ul');
    list.innerHTML = '';
    const todaysTransactions = allTransactionsCache.filter(t => t.timestamp.toDate() >= startOfDay && t.timestamp.toDate() <= endOfDay);
    
    todaysTransactions.forEach(t => {
        if (t.type === 'income') dailyIncome += t.amount;
        if (t.type === 'expense') dailyExpense += t.amount;
        list.innerHTML += `<li><span>${t.category}: ৳${t.amount} (${t.description})</span> <button class="delete-btn" data-id="${t.id}" data-type="transaction">🗑️</button></li>`;
    });

    const profitLoss = dailyIncome - dailyExpense;
    const dailyOnlineChange = todaysTransactions.filter(t => t.category.includes('online')).reduce((acc, curr) => acc + (curr.type === 'income' ? curr.amount : -curr.amount), 0);
    const dailyCashChange = todaysTransactions.filter(t => t.category.includes('cash')).reduce((acc, curr) => acc + (curr.type === 'income' ? curr.amount : -curr.amount), 0);
    
    const closingOnline = openingOnline + dailyOnlineChange;
    const closingCash = openingCash + dailyCashChange;
    
    document.getElementById('opening-balance').textContent = `৳${(openingOnline + openingCash).toFixed(2)}`;
    document.getElementById('daily-income').textContent = `৳${dailyIncome.toFixed(2)}`;
    document.getElementById('daily-expense').textContent = `৳${dailyExpense.toFixed(2)}`;
    const profitLossEl = document.getElementById('profit-loss');
    profitLossEl.textContent = `৳${profitLoss.toFixed(2)}`;
    profitLossEl.style.color = profitLoss >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    document.getElementById('closing-balance').textContent = `অনলাইন: ৳${closingOnline.toFixed(2)} | ক্যাশ: ৳${closingCash.toFixed(2)}`;
}

function loadAllDuesAndPayables() {
    const dueQuery = query(collection(db, `users/${currentUser.uid}/dues`), where('status', '!=', 'paid'), orderBy('customerName'));
    onSnapshot(dueQuery, snapshot => {
        const list = document.getElementById('due-list-ul'); list.innerHTML = '';
        snapshot.forEach(doc => {
            list.innerHTML += `<li data-id="${doc.id}" data-type="dues"><span><strong>${doc.data().customerName}</strong> - বাকি: ৳${doc.data().remainingAmount.toFixed(2)}</span><button class="view-due-btn">বিস্তারিত</button></li>`;
        });
    });

    const payableQuery = query(collection(db, `users/${currentUser.uid}/payables`), where('status', '!=', 'paid'), orderBy('personName'));
    onSnapshot(payableQuery, snapshot => {
        const list = document.getElementById('payable-list-ul'); list.innerHTML = '';
        snapshot.forEach(doc => {
            list.innerHTML += `<li data-id="${doc.id}" data-type="payables"><span><strong>${doc.data().personName}</strong> - দিতে হবে: ৳${doc.data().remainingAmount.toFixed(2)}</span><button class="view-due-btn">বিস্তারিত</button></li>`;
        });
    });
}

async function renderMonthlyChart() {
    if (!allTransactionsCache.length && !(await getDoc(doc(db, `users/${currentUser.uid}/balance/main`))).exists()) return;

    const labels = [];
    const onlineData = [];
    const cashData = [];
    
    const balanceDoc = await getDoc(doc(db, `users/${currentUser.uid}/balance/main`));
    const initialBalance = balanceDoc.exists() ? { online: balanceDoc.data().initialOnline || 0, cash: balanceDoc.data().initialCash || 0 } : { online: 0, cash: 0 };
    
    let runningOnline = initialBalance.online;
    let runningCash = initialBalance.cash;
    
    const transactionsByDate = {};
    allTransactionsCache.forEach(t => {
        const dateStr = t.timestamp.toDate().toISOString().split('T')[0];
        if (!transactionsByDate[dateStr]) transactionsByDate[dateStr] = [];
        transactionsByDate[dateStr].push(t);
    });

    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('bn-BD', {day: 'numeric', month: 'short'}));
        if (transactionsByDate[dateStr]) {
            transactionsByDate[dateStr].forEach(t => {
                if (t.category.includes('online')) runningOnline += (t.type === 'income' ? t.amount : -t.amount);
                if (t.category.includes('cash')) runningCash += (t.type === 'income' ? t.amount : -t.amount);
            });
        }
        onlineData.push(runningOnline);
        cashData.push(runningCash);
    }
    
    const ctx = document.getElementById('monthly-chart').getContext('2d');
    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(ctx, {
        type: 'line',
        data: { 
            labels, 
            datasets: [
                { label: 'অনলাইন ব্যালেন্স', data: onlineData, borderColor: '#2196F3', backgroundColor: 'rgba(33, 150, 243, 0.1)', fill: true, tension: 0.1 },
                { label: 'ক্যাশ ব্যালেন্স', data: cashData, borderColor: '#4CAF50', backgroundColor: 'rgba(76, 175, 80, 0.1)', fill: true, tension: 0.1 }
            ] 
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }
    });
}

categorySelect.addEventListener('change', () => { personNameInput.style.display = ['due', 'payable'].includes(categorySelect.value) ? 'block' : 'none'; });

document.getElementById('add-transaction-btn').addEventListener('click', async () => {
    const category = categorySelect.value;
    const amount = parseFloat(document.getElementById('amount').value);
    const description = document.getElementById('description').value;
    const person = personNameInput.value;
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
                    const newEntry = { status: 'unpaid', paidAmount: 0, totalAmount: amount, remainingAmount: amount, lastUpdatedAt: serverTimestamp() };
                    newEntry[nameField] = person;
                    transaction.set(entryRef, newEntry);
                } else {
                    const newTotal = docSnap.data().totalAmount + amount;
                    const newRemaining = docSnap.data().remainingAmount + amount;
                    transaction.update(entryRef, { totalAmount: newTotal, remainingAmount: newRemaining, lastUpdatedAt: serverTimestamp() });
                }
                transaction.set(doc(collection(entryRef, 'items')), data);
            });
        } catch (e) { console.error("Transaction failed: ", e); alert("এন্ট্রি যোগ করতে সমস্যা হয়েছে। Firebase Index তৈরি করেছেন কি?"); }
    } else {
        const type = category.includes('income') ? 'income' : 'expense';
        await addDoc(collection(db, `users/${currentUser.uid}/transactions`), { category, amount, description, type, timestamp: serverTimestamp() });
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
    transactionForm.reset(); personNameInput.style.display = 'none';
    await fetchAllTransactionsOnce();
    loadTransactionsAndReportForDate(datePicker.valueAsDate);
    renderMonthlyChart();
});

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
    
