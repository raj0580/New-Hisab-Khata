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
const authContainer = document.getElementById('auth-container'), appContainer = document.getElementById('app-container'), setupScreen = document.getElementById('setup-screen'), mainApp = document.getElementById('main-app'), loginBtn = document.getElementById('login-btn'), signupLink = document.getElementById('signup-link'), logoutBtn = document.getElementById('logout-btn'), emailInput = document.getElementById('email'), passwordInput = document.getElementById('password'), datePicker = document.getElementById('date-picker'), categorySelect = document.getElementById('category'), customerNameInput = document.getElementById('customer-name'), transactionForm = document.getElementById('transaction-form'), saveInitialBalanceBtn = document.getElementById('save-initial-balance'), skipBalanceSetupBtn = document.getElementById('skip-balance-setup'), modal = document.getElementById('due-details-modal');
let currentUser, currentOpenDueId, hasCheckedBalance = false;

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
    if(datePicker) { datePicker.valueAsDate = new Date(); loadDashboardData(); loadTransactionsForDate(datePicker.valueAsDate); loadAllDues(); }
}

saveInitialBalanceBtn.addEventListener('click', async () => {
    const online = parseFloat(document.getElementById('initial-online-balance').value) || 0;
    const cash = parseFloat(document.getElementById('initial-cash-balance').value) || 0;
    await setDoc(doc(db, 'users', currentUser.uid, 'balance', 'main'), { online, cash }); showMainApp();
});
skipBalanceSetupBtn.addEventListener('click', async () => { await setDoc(doc(db, 'users', currentUser.uid, 'balance', 'main'), { online: 0, cash: 0 }); showMainApp(); });

// Data Loading Functions
datePicker.addEventListener('change', () => loadTransactionsForDate(datePicker.valueAsDate));

function loadDashboardData() {
    const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    onSnapshot(balanceRef, (doc) => {
        if (!doc.exists()) return;
        const data = doc.data();
        document.getElementById('online-balance').textContent = `৳${data.online.toFixed(2)}`;
        document.getElementById('cash-balance').textContent = `৳${data.cash.toFixed(2)}`;
        document.getElementById('total-balance').textContent = `৳${(data.online + data.cash).toFixed(2)}`;
    });
}

function loadTransactionsForDate(selectedDate) {
    const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999);
    const q = query(collection(db, 'users', currentUser.uid, 'transactions'), where('timestamp', '>=', startOfDay), where('timestamp', '<=', endOfDay), orderBy('timestamp', 'desc'));
    onSnapshot(q, snapshot => {
        let dailyIncome = 0; let dailyExpense = 0;
        const list = document.getElementById('transactions-list-ul');
        list.innerHTML = '';
        snapshot.forEach(doc => {
            const t = doc.data();
            if (t.type === 'income') dailyIncome += t.amount;
            if (t.type === 'expense') dailyExpense += t.amount;
            list.innerHTML += `<li><span>${t.category}: ৳${t.amount} (${t.description})</span> <button class="delete-btn" data-id="${doc.id}" data-type="transaction">🗑️</button></li>`;
        });
        document.getElementById('today-income').textContent = `৳${dailyIncome.toFixed(2)}`;
        document.getElementById('today-expense').textContent = `৳${dailyExpense.toFixed(2)}`;
    });
}

function loadAllDues() {
    const q = query(collection(db, 'users', currentUser.uid, 'dues'), where('status', '!=', 'paid'), orderBy('customerName'));
    onSnapshot(q, snapshot => {
        const dueListUl = document.getElementById('due-list-ul');
        dueListUl.innerHTML = '';
        snapshot.forEach(doc => {
            const due = doc.data();
            dueListUl.innerHTML += `<li data-id="${doc.id}"><span><strong>${due.customerName}</strong> - বাকি: ৳${due.remainingAmount.toFixed(2)}</span><button class="view-due-btn">বিস্তারিত</button></li>`;
        });
    }, error => console.error("Error loading dues:", error));
}

// Add Transaction / Due Logic
categorySelect.addEventListener('change', () => customerNameInput.style.display = categorySelect.value === 'due' ? 'block' : 'none');
document.getElementById('add-transaction-btn').addEventListener('click', async () => {
    const category = categorySelect.value;
    const amount = parseFloat(document.getElementById('amount').value);
    const description = document.getElementById('description').value;
    if (!amount || amount <= 0) return alert('সঠিক পরিমাণ দিন।');
    if (category === 'due' && !description) return alert('আইটেমের নাম/বর্ণনা দিন।');

    if (category === 'due') {
        const customerName = customerNameInput.value;
        if (!customerName) return alert('কাস্টমারের নাম দিন।');
        
        const q = query(collection(db, 'users', currentUser.uid, 'dues'), where('customerName', '==', customerName), where('status', '!=', 'paid'));
        const existingDueSnap = await getDocs(q);
        
        let dueRef;
        if (existingDueSnap.empty) {
            dueRef = doc(collection(db, 'users', currentUser.uid, 'dues')); // Get ref before transaction
        } else {
            dueRef = existingDueSnap.docs[0].ref;
        }
        
        try {
            await runTransaction(db, async (transaction) => {
                const dueDoc = await transaction.get(dueRef);
                if (!dueDoc.exists()) {
                    transaction.set(dueRef, {
                        customerName, totalAmount: amount, paidAmount: 0, remainingAmount: amount,
                        lastUpdatedAt: serverTimestamp(), status: 'unpaid'
                    });
                } else {
                    const newTotal = dueDoc.data().totalAmount + amount;
                    const newRemaining = dueDoc.data().remainingAmount + amount;
                    transaction.update(dueRef, { totalAmount: newTotal, remainingAmount: newRemaining, lastUpdatedAt: serverTimestamp() });
                }
                const newItemRef = doc(collection(dueRef, 'items'));
                transaction.set(newItemRef, { name: description, amount: amount, date: serverTimestamp() });
            });
        } catch (e) { console.error("Transaction failed: ", e); }

    } else {
        const type = category.includes('income') ? 'income' : 'expense';
        await addDoc(collection(db, 'users', currentUser.uid, 'transactions'), { category, amount, description, type, timestamp: serverTimestamp() });
        const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
        const balanceDoc = await getDoc(balanceRef);
        if (balanceDoc.exists()) {
            const b = balanceDoc.data();
            if (category === 'online-income') b.online += amount; else if (category === 'cash-income') b.cash += amount;
            else if (category === 'online-expense') b.online -= amount; else if (category === 'cash-expense') b.cash -= amount;
            await updateDoc(balanceRef, b);
        }
    }
    transactionForm.reset(); customerNameInput.style.display = 'none';
});

// Advanced Due Modal Logic
document.getElementById('due-list-ul').addEventListener('click', e => {
    if (!e.target.classList.contains('view-due-btn')) return;
    currentOpenDueId = e.target.closest('li').dataset.id;
    const dueRef = doc(db, 'users', currentUser.uid, 'dues', currentOpenDueId);

    onSnapshot(dueRef, d => {
        if (!d.exists()) { modal.style.display = 'none'; return; }
        const dueData = d.data();
        document.getElementById('modal-customer-name').textContent = dueData.customerName;
        document.getElementById('modal-total-due').textContent = `৳${dueData.totalAmount.toFixed(2)}`;
        document.getElementById('modal-paid-due').textContent = `৳${dueData.paidAmount.toFixed(2)}`;
        document.getElementById('modal-remaining-due').textContent = `৳${dueData.remainingAmount.toFixed(2)}`;
        
        const itemsQuery = query(collection(dueRef, 'items'), orderBy('date', 'desc'));
        onSnapshot(itemsQuery, i_snap => {
            const itemListUl = document.getElementById('modal-item-list');
            itemListUl.innerHTML = '';
            i_snap.forEach(i_doc => {
                const item = i_doc.data();
                const dateStr = item.date ? item.date.toDate().toLocaleDateString() : '';
                itemListUl.innerHTML += `<li><span>${item.name} <small>(${dateStr})</small></span><span>৳${item.amount.toFixed(2)}</span></li>`;
            });
        });
        
        const paymentsQuery = query(collection(dueRef, 'payments'), orderBy('paymentDate', 'desc'));
        onSnapshot(paymentsQuery, p_snap => {
            const historyUl = document.getElementById('modal-payment-history');
            historyUl.innerHTML = '';
            p_snap.forEach(p_doc => {
                const p = p_doc.data();
                if (p.paymentDate) {
                    historyUl.innerHTML += `<li>${p.paymentDate.toDate().toLocaleDateString()}: ৳${p.amount.toFixed(2)}</li>`;
                }
            });
        });
    });
    modal.style.display = 'block';
});
document.querySelector('.close-btn').onclick = () => modal.style.display = 'none';

document.getElementById('add-item-btn').addEventListener('click', async () => {
    const itemName = document.getElementById('new-item-name').value;
    const itemAmount = parseFloat(document.getElementById('new-item-amount').value);
    if (!itemName || !itemAmount || itemAmount <= 0) return alert('সঠিক আইটেম ও দাম দিন।');

    const dueRef = doc(db, 'users', currentUser.uid, 'dues', currentOpenDueId);
    await runTransaction(db, async (transaction) => {
        const dueDoc = await transaction.get(dueRef);
        if (!dueDoc.exists()) throw "Due does not exist!";
        const newTotal = dueDoc.data().totalAmount + itemAmount;
        const newRemaining = dueDoc.data().remainingAmount + itemAmount;
        transaction.update(dueRef, { totalAmount: newTotal, remainingAmount: newRemaining, lastUpdatedAt: serverTimestamp() });
        const newItemRef = doc(collection(dueRef, 'items'));
        transaction.set(newItemRef, { name: itemName, amount: itemAmount, date: serverTimestamp() });
    });
    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-amount').value = '';
});

document.getElementById('add-payment-btn').addEventListener('click', async () => {
    const paymentAmount = parseFloat(document.getElementById('new-payment-amount').value);
    const dueRef = doc(db, 'users', currentUser.uid, 'dues', currentOpenDueId);
    
    await runTransaction(db, async (transaction) => {
        const dueDoc = await transaction.get(dueRef);
        if (!dueDoc.exists()) throw "Due does not exist!";
        if (!paymentAmount || paymentAmount <= 0 || paymentAmount > dueDoc.data().remainingAmount) throw "সঠিক পেমেন্টের পরিমাণ দিন";

        const newPaid = dueDoc.data().paidAmount + paymentAmount;
        const newRemaining = dueDoc.data().remainingAmount - paymentAmount;
        transaction.update(dueRef, { paidAmount: newPaid, remainingAmount: newRemaining, status: newRemaining <= 0 ? 'paid' : 'partially-paid', lastUpdatedAt: serverTimestamp() });
        const newPaymentRef = doc(collection(dueRef, 'payments'));
        transaction.set(newPaymentRef, { amount: paymentAmount, paymentDate: serverTimestamp() });
    });
    document.getElementById('new-payment-amount').value = '';
});

// Delete Logic
mainApp.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('delete-btn')) return;
    const id = e.target.dataset.id; const type = e.target.dataset.type;
    if (!id || !type || !confirm("আপনি কি এই লেনদেনটি মুছে ফেলতে নিশ্চিত?")) return;

    if (type === 'transaction') {
        const transRef = doc(db, 'users', currentUser.uid, 'transactions', id);
        const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
        try {
            await runTransaction(db, async (transaction) => {
                const transDoc = await transaction.get(transRef);
                const balanceDoc = await transaction.get(balanceRef);
                if (!transDoc.exists() || !balanceDoc.exists()) throw "Document not found";
                
                const tData = transDoc.data();
                const bData = balanceDoc.data();

                if (tData.category === 'online-income') bData.online -= tData.amount;
                else if (tData.category === 'cash-income') bData.cash -= tData.amount;
                else if (tData.category === 'online-expense') bData.online += tData.amount;
                else if (tData.category === 'cash-expense') bData.cash += tData.amount;
                
                transaction.update(balanceRef, { online: bData.online, cash: bData.cash });
                transaction.delete(transRef);
            });
        } catch (error) { console.error("Error deleting transaction:", error); alert("লেনদেনটি মুছতে সমস্যা হয়েছে।"); }
    }
});
