// ধাপ ১: প্রয়োজনীয় সব ফাংশন ইম্পোর্ট করুন
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, query, onSnapshot, deleteDoc, updateDoc, where, serverTimestamp, enableIndexedDbPersistence, writeBatch, Timestamp, orderBy } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// ধাপ ২: Service Worker রেজিস্টার করুন
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => console.log('Service Worker: Registered')).catch(err => console.log(`Service Worker: Error: ${err}`));
  });
}

// ধাপ ৩: Firebase কনফিগারেশন এবং ইনিশিয়ালাইজেশন
const firebaseConfig = { apiKey: "AIzaSyCESxz9Tyc0GvcY5PfWcPda0kArYb_6Jvg", authDomain: "new-hisab-khata.firebaseapp.com", databaseURL: "https://new-hisab-khata-default-rtdb.firebaseio.com", projectId: "new-hisab-khata", storageBucket: "new-hisab-khata.firebasestorage.app", messagingSenderId: "116945944640", appId: "1:116945944640:web:8d944c18a0e4daaee19fa5", measurementId: "G-R71KCTMZC6" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ধাপ ৪: অফলাইন ডেটা চালু করুন
enableIndexedDbPersistence(db).catch(err => console.error("Persistence error: ", err.code));

// ধাপ ৫: সব DOM Elements গুলোকে ধরুন
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const setupScreen = document.getElementById('setup-screen');
const mainApp = document.getElementById('main-app');
const loginBtn = document.getElementById('login-btn');
const signupLink = document.getElementById('signup-link');
const logoutBtn = document.getElementById('logout-btn');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const datePicker = document.getElementById('date-picker');
const categorySelect = document.getElementById('category');
const customerNameInput = document.getElementById('customer-name');
const transactionForm = document.getElementById('transaction-form');
const saveInitialBalanceBtn = document.getElementById('save-initial-balance');
const skipBalanceSetupBtn = document.getElementById('skip-balance-setup');
const modal = document.getElementById('due-details-modal');

let currentUser;
let currentOpenDue = {};
let hasCheckedBalance = false;

// ধাপ ৬: অথেনটিকেশন (ইউজার লগইন বা লগআউট করলে কী হবে)
onAuthStateChanged(auth, user => {
    if (user) {
        currentUser = user;
        authContainer.style.display = 'none';
        appContainer.style.display = 'block';
        hasCheckedBalance = false; // নতুন করে লগইন হলে রিসেট করুন
        checkInitialBalance();
    } else {
        currentUser = null;
        authContainer.style.display = 'block';
        appContainer.style.display = 'none';
    }
});

// লগইন, সাইনআপ, লগআউট বাটন
loginBtn.addEventListener('click', () => signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value).catch(err => alert(err.message)));
signupLink.addEventListener('click', e => { e.preventDefault(); createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value).catch(err => alert(err.message)); });
logoutBtn.addEventListener('click', () => signOut(auth));

// উন্নত checkInitialBalance ফাংশন
async function checkInitialBalance() {
    if (!currentUser || hasCheckedBalance) return;
    const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    try {
        const balanceSnap = await getDoc(balanceRef);
        hasCheckedBalance = true;
        if (balanceSnap.exists()) {
            showMainApp();
        } else {
            setupScreen.style.display = 'block';
            mainApp.style.display = 'none';
        }
    } catch (error) {
        console.error("Error checking balance:", error);
        setupScreen.style.display = 'block';
        mainApp.style.display = 'none';
    }
}

// মূল অ্যাপ দেখানোর জন্য ফাংশন
function showMainApp() {
    setupScreen.style.display = 'none';
    mainApp.style.display = 'block';
    if(datePicker) {
        datePicker.valueAsDate = new Date();
        loadDashboardData();
        loadTransactionsForDate(datePicker.valueAsDate);
        loadAllDues();
    }
}

// Initial balance save বাটন
saveInitialBalanceBtn.addEventListener('click', async () => {
    const online = parseFloat(document.getElementById('initial-online-balance').value) || 0;
    const cash = parseFloat(document.getElementById('initial-cash-balance').value) || 0;
    await setDoc(doc(db, 'users', currentUser.uid, 'balance', 'main'), { online, cash });
    showMainApp();
});

// Skip বাটন
skipBalanceSetupBtn.addEventListener('click', async () => {
    await setDoc(doc(db, 'users', currentUser.uid, 'balance', 'main'), { online: 0, cash: 0 });
    showMainApp();
});

// তারিখ পরিবর্তন হলে ডেটা লোড
if(datePicker) {
    datePicker.addEventListener('change', () => loadTransactionsForDate(datePicker.valueAsDate));
}

// ড্যাশবোর্ড ডেটা লোড
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

// নির্দিষ্ট তারিখের লেনদেন লোড
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

// সকল ডিউ লোড
function loadAllDues() {
    const q = query(collection(db, 'users', currentUser.uid, 'dues'), where('status', '!=', 'paid'), orderBy('status'), orderBy('customerName'));
    onSnapshot(q, snapshot => {
        const dueListUl = document.getElementById('due-list-ul');
        dueListUl.innerHTML = '';
        snapshot.forEach(doc => {
            const due = doc.data();
            dueListUl.innerHTML += `<li data-id="${doc.id}"><span><strong>${due.customerName}</strong> - বাকি: ৳${due.remainingAmount.toFixed(2)}</span><button class="view-due-btn">বিস্তারিত</button></li>`;
        });
    }, error => console.error("Error loading dues:", error));
}

// লেনদেন যোগ করার লজিক
categorySelect.addEventListener('change', () => customerNameInput.style.display = categorySelect.value === 'due' ? 'block' : 'none');
document.getElementById('add-transaction-btn').addEventListener('click', async () => {
    const category = categorySelect.value;
    const amount = parseFloat(document.getElementById('amount').value);
    const description = document.getElementById('description').value;
    if (!amount || amount <= 0) return alert('সঠিক টাকার পরিমাণ দিন।');
    
    try {
        if (category === 'due') {
            const customerName = customerNameInput.value;
            if (!customerName) return alert('কাস্টমারের নাম দিন।');
            await addDoc(collection(db, 'users', currentUser.uid, 'dues'), { customerName, totalAmount: amount, paidAmount: 0, remainingAmount: amount, items: description, createdAt: serverTimestamp(), status: 'unpaid' });
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
        transactionForm.reset();
        customerNameInput.style.display = 'none';
    } catch(err) { console.error("Error adding transaction: ", err); }
});

// ডিউ মডাল এবং পেমেন্ট লজিক
document.getElementById('due-list-ul').addEventListener('click', async e => {
    if (!e.target.classList.contains('view-due-btn')) return;
    const dueId = e.target.closest('li').dataset.id;
    currentOpenDue.id = dueId;
    const dueRef = doc(db, 'users', currentUser.uid, 'dues', dueId);
    onSnapshot(dueRef, d => {
        if (!d.exists()) { modal.style.display = 'none'; return; }
        const dueData = d.data(); currentOpenDue.data = dueData;
        document.getElementById('modal-customer-name').textContent = dueData.customerName;
        document.getElementById('modal-remaining-due').textContent = `৳${dueData.remainingAmount.toFixed(2)}`;
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
document.getElementById('add-payment-btn').addEventListener('click', async () => {
    const paymentAmount = parseFloat(document.getElementById('new-payment-amount').value);
    if (!paymentAmount || paymentAmount <= 0 || paymentAmount > currentOpenDue.data.remainingAmount) return alert('সঠিক পেমেন্টের পরিমাণ দিন');
    const dueRef = doc(db, 'users', currentUser.uid, 'dues', currentOpenDue.id);
    const newPaid = currentOpenDue.data.paidAmount + paymentAmount;
    const newRemaining = currentOpenDue.data.totalAmount - newPaid;
    const batch = writeBatch(db);
    batch.update(dueRef, { paidAmount: newPaid, remainingAmount: newRemaining, status: newRemaining <= 0 ? 'paid' : 'partially-paid' });
    batch.set(doc(collection(dueRef, 'payments')), { amount: paymentAmount, paymentDate: serverTimestamp() });
    await batch.commit();
    document.getElementById('new-payment-amount').value = '';
    modal.style.display = 'none';
});

// ডিলিট করার লজিক
mainApp.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('delete-btn')) return;
    const id = e.target.dataset.id; const type = e.target.dataset.type;
    if (!id || !type || !confirm("আপনি কি এই লেনদেনটি মুছে ফেলতে নিশ্চিত?")) return;

    if (type === 'transaction') {
        const transRef = doc(db, 'users', currentUser.uid, 'transactions', id);
        const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
        try {
            const transDoc = await getDoc(transRef);
            if (!transDoc.exists()) return console.error("Transaction not found!");
            const transaction = transDoc.data();
            const balanceDoc = await getDoc(balanceRef);
            if (!balanceDoc.exists()) return console.error("Balance not found!");
            const balance = balanceDoc.data();
            if (transaction.category === 'online-income') balance.online -= transaction.amount;
            else if (transaction.category === 'cash-income') balance.cash -= transaction.amount;
            else if (transaction.category === 'online-expense') balance.online += transaction.amount;
            else if (transaction.category === 'cash-expense') balance.cash += transaction.amount;
            const batch = writeBatch(db);
            batch.update(balanceRef, { online: balance.online, cash: balance.cash });
            batch.delete(transRef);
            await batch.commit();
        } catch (error) { console.error("Error deleting transaction:", error); alert("লেনদেনটি মুছতে সমস্যা হয়েছে।"); }
    }
});
