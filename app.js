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
let currentUser, currentOpenEntryId, currentOpenEntryType, monthlyChart, hasCheckedBalance = false;

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

function showMainApp() {
    setupScreen.style.display = 'none'; mainApp.style.display = 'block';
    if(datePicker) { datePicker.valueAsDate = new Date(); loadDashboardData(); loadTransactionsAndReportForDate(datePicker.valueAsDate); loadAllDuesAndPayables(); renderMonthlyChart(); }
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

// Data Loading & Reporting
datePicker.addEventListener('change', () => loadTransactionsAndReportForDate(datePicker.valueAsDate));

function loadDashboardData() {
    const balanceRef = doc(db, `users/${currentUser.uid}/balance/main`);
    onSnapshot(balanceRef, (doc) => {
        if (!doc.exists()) return;
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

    const transactionsQuery = query(collection(db, `users/${currentUser.uid}/transactions`), orderBy('timestamp'));
    const transactionsSnap = await getDocs(transactionsQuery);
    const allTransactions = transactionsSnap.docs.map(d => d.data());
    
    const balanceDoc = await getDoc(doc(db, `users/${currentUser.uid}/balance/main`));
    const initialBalance = balanceDoc.exists() ? { online: balanceDoc.data().initialOnline || 0, cash: balanceDoc.data().initialCash || 0 } : { online: 0, cash: 0 };

    let openingOnline = initialBalance.online;
    let openingCash = initialBalance.cash;

    allTransactions.forEach(t => {
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
    allTransactions.filter(t => t.timestamp.toDate() >= startOfDay && t.timestamp.toDate() <= endOfDay).forEach(t => {
        if (t.type === 'income') dailyIncome += t.amount;
        if (t.type === 'expense') dailyExpense += t.amount;
        list.innerHTML += `<li><span>${t.category}: ৳${t.amount} (${t.description})</span> <button class="delete-btn" data-id="${t.id}" data-type="transaction">🗑️</button></li>`;
    });

    const profitLoss = dailyIncome - dailyExpense;
    const closingOnline = openingOnline + allTransactions.filter(t => t.timestamp.toDate() >= startOfDay && t.timestamp.toDate() <= endOfDay && t.category.includes('online')).reduce((acc, curr) => acc + (curr.type === 'income' ? curr.amount : -curr.amount), 0);
    const closingCash = openingCash + allTransactions.filter(t => t.timestamp.toDate() >= startOfDay && t.timestamp.toDate() <= endOfDay && t.category.includes('cash')).reduce((acc, curr) => acc + (curr.type === 'income' ? curr.amount : -curr.amount), 0);
    
    document.getElementById('opening-balance').textContent = `৳${(openingOnline + openingCash).toFixed(2)}`;
    document.getElementById('daily-income').textContent = `৳${dailyIncome.toFixed(2)}`;
    document.getElementById('daily-expense').textContent = `৳${dailyExpense.toFixed(2)}`;
    const profitLossEl = document.getElementById('profit-loss');
    profitLossEl.textContent = `৳${profitLoss.toFixed(2)}`;
    profitLossEl.style.color = profitLoss >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    document.getElementById('closing-balance').textContent = `৳${(closingOnline + closingCash).toFixed(2)}`;
}


function loadAllDuesAndPayables() {
    const dueQuery = query(collection(db, `users/${currentUser.uid}/dues`), where('status', '!=', 'paid'), orderBy('customerName'));
    onSnapshot(dueQuery, snapshot => {
        const list = document.getElementById('due-list-ul'); list.innerHTML = '';
        snapshot.forEach(doc => list.innerHTML += `<li data-id="${doc.id}" data-type="dues"><span><strong>${doc.data().customerName}</strong> - বাকি: ৳${doc.data().remainingAmount.toFixed(2)}</span><button class="view-due-btn">বিস্তারিত</button></li>`);
    });

    const payableQuery = query(collection(db, `users/${currentUser.uid}/payables`), where('status', '!=', 'paid'), orderBy('personName'));
    onSnapshot(payableQuery, snapshot => {
        const list = document.getElementById('payable-list-ul'); list.innerHTML = '';
        snapshot.forEach(doc => list.innerHTML += `<li data-id="${doc.id}" data-type="payables"><span><strong>${doc.data().personName}</strong> - দিতে হবে: ৳${doc.data().remainingAmount.toFixed(2)}</span><button class="view-due-btn">বিস্তারিত</button></li>`);
    });
}

async function renderMonthlyChart() {
    // This is a simplified version. For full accuracy, it should calculate closing balance for each of the last 30 days.
    // This can be slow. A better approach is to store daily snapshots in a separate collection.
    const labels = [...Array(30)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toLocaleDateString('bn-BD', {day: 'numeric', month: 'short'}); }).reverse();
    const data = labels.map(() => Math.random() * 10000 + 5000); // Placeholder data for performance
    
    const ctx = document.getElementById('monthly-chart').getContext('2d');
    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'মাসিক ব্যালেন্স গ্রাফ', data, borderColor: '#2196F3', backgroundColor: 'rgba(33, 150, 243, 0.1)', fill: true, tension: 0.1 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }
    });
}

// Add Entry Logic
categorySelect.addEventListener('change', () => {
    personNameInput.style.display = ['due', 'payable'].includes(categorySelect.value) ? 'block' : 'none';
});
document.getElementById('add-transaction-btn').addEventListener('click', async () => {
    const category = categorySelect.value;
    const amount = parseFloat(document.getElementById('amount').value);
    const description = document.getElementById('description').value;
    const person = personNameInput.value;
    if (!amount || amount <= 0) return alert('সঠিক পরিমাণ দিন।');
    
    const isDueOrPayable = ['due', 'payable'].includes(category);
    const collectionName = category === 'due' ? 'dues' : 'payables';
    const nameField = category === 'due' ? 'customerName' : 'personName';

    if (isDueOrPayable) {
        if (!person) return alert('ব্যক্তির নাম দিন।');
        const q = query(collection(db, `users/${currentUser.uid}/${collectionName}`), where(nameField, '==', person), where('status', '!=', 'paid'));
        const existingEntrySnap = await getDocs(q);
        let entryRef = existingEntrySnap.empty ? doc(collection(db, `users/${currentUser.uid}/${collectionName}`)) : existingEntrySnap.docs[0].ref;
        
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(entryRef);
            const data = { name: description, amount, date: serverTimestamp() };
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
});

// Modal, Item, Payment, Delete Logic
function setupModalEventListeners(listId) {
    document.getElementById(listId).addEventListener('click', e => {
        if (!e.target.classList.contains('view-due-btn')) return;
        const listItem = e.target.closest('li');
        currentOpenEntryId = listItem.dataset.id;
        currentOpenEntryType = listItem.dataset.type; // 'dues' or 'payables'
        const entryRef = doc(db, `users/${currentUser.uid}/${currentOpenEntryType}/${currentOpenEntryId}`);
        
        onSnapshot(entryRef, d => { /* ... Render modal with data ... */ });
        modal.style.display = 'block';
    });
}
setupModalEventListeners('due-list-ul');
setupModalEventListeners('payable-list-ul');

document.querySelector('.close-btn').onclick = () => modal.style.display = 'none';
// Add item/payment and delete logic would need to be updated to use currentOpenEntryType
