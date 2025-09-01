// ধাপ ১: প্রয়োজনীয় সব ফাংশন ইম্পোর্ট করুন
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, query, onSnapshot, deleteDoc, updateDoc, where, serverTimestamp, enableIndexedDbPersistence, writeBatch, Timestamp, orderBy } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// ধাপ ২: Service Worker ও Firebase ইনিশিয়ালাইজেশন
if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js')); }
const firebaseConfig = { apiKey: "AIzaSyCESxz9Tyc0GvcY5PfWcPda0kArYb_6Jvg", authDomain: "new-hisab-khata.firebaseapp.com", projectId: "new-hisab-khata", storageBucket: "new-hisab-khata.firebasestorage.app", appId: "1:116945944640:web:8d944c18a0e4daaee19fa5" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
enableIndexedDbPersistence(db).catch(err => console.error("Persistence error: ", err.code));

// ধাপ ৩: DOM Elements
const authContainer = document.getElementById('auth-container'), appContainer = document.getElementById('app-container'), setupScreen = document.getElementById('setup-screen'), mainApp = document.getElementById('main-app'), loginBtn = document.getElementById('login-btn'), signupLink = document.getElementById('signup-link'), logoutBtn = document.getElementById('logout-btn'), emailInput = document.getElementById('email'), passwordInput = document.getElementById('password'), datePicker = document.getElementById('date-picker'), categorySelect = document.getElementById('category'), customerNameInput = document.getElementById('customer-name'), transactionForm = document.getElementById('transaction-form'), saveInitialBalanceBtn = document.getElementById('save-initial-balance'), skipBalanceSetupBtn = document.getElementById('skip-balance-setup'), modal = document.getElementById('due-details-modal');
let currentUser, currentOpenDue = {}, hasCheckedBalance = false;

// ধাপ ৪: Auth & Initial Checks
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
    if(datePicker) { datePicker.valueAsDate = new Date(); loadDashboardData(); loadTransactionsForDate(datePicker.valueAsDate); loadAllDues_Simple(); } // Using simple due loader
}
saveInitialBalanceBtn.addEventListener('click', async () => {
    const online = parseFloat(document.getElementById('initial-online-balance').value) || 0;
    const cash = parseFloat(document.getElementById('initial-cash-balance').value) || 0;
    await setDoc(doc(db, 'users', currentUser.uid, 'balance', 'main'), { online, cash }); showMainApp();
});
skipBalanceSetupBtn.addEventListener('click', async () => { await setDoc(doc(db, 'users', currentUser.uid, 'balance', 'main'), { online: 0, cash: 0 }); showMainApp(); });

// ধাপ ৫: Data Loading (Simple Due Version)
datePicker.addEventListener('change', () => loadTransactionsForDate(datePicker.valueAsDate));
function loadDashboardData() { /* ... unchanged ... */ }
function loadTransactionsForDate(selectedDate) { /* ... unchanged ... */ }

// * Reverted to Simple Due Loading Logic *
function loadAllDues_Simple() {
    const q = query(collection(db, 'users', currentUser.uid, 'dues'), orderBy('customerName'));
    onSnapshot(q, snapshot => {
        const dueListUl = document.getElementById('due-list-ul');
        dueListUl.innerHTML = '';
        snapshot.forEach(doc => {
            const due = doc.data();
            // This reads the old structure with 'remainingAmount'
            const remaining = due.remainingAmount !== undefined ? due.remainingAmount : due.amount; // Handle old and new docs
            dueListUl.innerHTML += <li data-id="${doc.id}"><span><strong>${due.customerName}</strong> - বাকি: ৳${remaining.toFixed(2)}</span><button class="delete-btn" data-id="${doc.id}" data-type="due">🗑️</button></li>;
        });
    }, error => console.error("Error loading dues:", error));
}

// ধাপ ৬: Add Transaction (Simple Due Logic)
categorySelect.addEventListener('change', () => customerNameInput.style.display = categorySelect.value === 'due' ? 'block' : 'none');
document.getElementById('add-transaction-btn').addEventListener('click', async () => {
    const category = categorySelect.value;
    const amount = parseFloat(document.getElementById('amount').value);
    const description = document.getElementById('description').value;
    if (!amount || amount <= 0) return alert('সঠিক পরিমাণ দিন।');
    
    if (category === 'due') {
        const customerName = customerNameInput.value;
        if (!customerName) return alert('কাস্টমারের নাম দিন।');
        // Reverted to simple due creation
        await addDoc(collection(db, 'users', currentUser.uid, 'dues'), {
            customerName,
            amount: amount, // Using 'amount' field
            remainingAmount: amount,
            description: description,
            createdAt: serverTimestamp(),
            status: 'unpaid' // Still useful for future
        });
    } else { // Handle regular income/expense
         // ... unchanged ...
    }
    transactionForm.reset(); customerNameInput.style.display = 'none';
});

// ধাপ ৭: Delete Logic (including simple due delete)
mainApp.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('delete-btn')) return;
    const id = e.target.dataset.id; const type = e.target.dataset.type;
    if (!id || !type || !confirm("আপনি কি এই এন্ট্রিটি মুছে ফেলতে নিশ্চিত?")) return;

    if (type === 'transaction') {
         // ... unchanged ...
    } else if (type === 'due') {
        // Simple due delete logic
        try {
            await deleteDoc(doc(db, 'users', currentUser.uid, 'dues', id));
            console.log("Due deleted successfully");
        } catch(err) {
            console.error("Error deleting due: ", err);
            alert("ডিউ মুছতে সমস্যা হয়েছে।");
        }
    }
});


// Unchanged helper functions
function loadDashboardData() {const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main'); onSnapshot(balanceRef, (doc) => { if (!doc.exists()) return; const data = doc.data(); document.getElementById('online-balance').textContent = ৳${data.online.toFixed(2)}; document.getElementById('cash-balance').textContent = ৳${data.cash.toFixed(2)}; document.getElementById('total-balance').textContent = ৳${(data.online + data.cash).toFixed(2)}; });}
function loadTransactionsForDate(selectedDate) { const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0); const endOfDay = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999); const q = query(collection(db, 'users', currentUser.uid, 'transactions'), where('timestamp', '>=', startOfDay), where('timestamp', '<=', endOfDay), orderBy('timestamp', 'desc')); onSnapshot(q, snapshot => { let dailyIncome = 0; let dailyExpense = 0; const list = document.getElementById('transactions-list-ul'); list.innerHTML = ''; snapshot.forEach(doc => { const t = doc.data(); if (t.type === 'income') dailyIncome += t.amount; if (t.type === 'expense') dailyExpense += t.amount; list.innerHTML += <li><span>${t.category}: ৳${t.amount} (${t.description})</span> <button class="delete-btn" data-id="${doc.id}" data-type="transaction">🗑️</button></li>; }); document.getElementById('today-income').textContent = ৳${dailyIncome.toFixed(2)}; document.getElementById('today-expense').textContent = ৳${dailyExpense.toFixed(2)}; });}
document.getElementById('add-transaction-btn').addEventListener('click', async () => { const category = categorySelect.value; const amount = parseFloat(document.getElementById('amount').value); const description = document.getElementById('description').value; if (!amount || amount <= 0) return alert('সঠিক টাকার পরিমাণ দিন।'); if (category === 'due') { const customerName = customerNameInput.value; if (!customerName) return alert('কাস্টমারের নাম দিন।'); await addDoc(collection(db, 'users', currentUser.uid, 'dues'), { customerName, amount, remainingAmount: amount, description, createdAt: serverTimestamp(), status: 'unpaid' }); } else { const type = category.includes('income') ? 'income' : 'expense'; await addDoc(collection(db, 'users', currentUser.uid, 'transactions'), { category, amount, description, type, timestamp: serverTimestamp() }); const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main'); const balanceDoc = await getDoc(balanceRef); if (balanceDoc.exists()) { const b = balanceDoc.data(); if (category === 'online-income') b.online += amount; else if (category === 'cash-income') b.cash += amount; else if (category === 'online-expense') b.online -= amount; else if (category === 'cash-expense') b.cash -= amount; await updateDoc(balanceRef, b); } } transactionForm.reset(); customerNameInput.style.display = 'none'; });
mainApp.addEventListener('click', async (e) => { if (!e.target.classList.contains('delete-btn')) return; const id = e.target.dataset.id; const type = e.target.dataset.type; if (!id || !type || !confirm("আপনি কি এই এন্ট্রিটি মুছে ফেলতে নিশ্চিত?")) return; if (type === 'transaction') { const transRef = doc(db, 'users', currentUser.uid, 'transactions', id); const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main'); try { const transDoc = await getDoc(transRef); if (!transDoc.exists()) return; const transaction = transDoc.data(); const balanceDoc = await getDoc(balanceRef); if (!balanceDoc.exists()) return; const balance = balanceDoc.data(); if (transaction.category === 'online-income') balance.online -= transaction.amount; else if (transaction.category === 'cash-income') balance.cash -= transaction.amount; else if (transaction.category === 'online-expense') balance.online += transaction.amount; else if (transaction.category === 'cash-expense') balance.cash += transaction.amount; const batch = writeBatch(db); batch.update(balanceRef, { online: balance.online, cash: balance.cash }); batch.delete(transRef); await batch.commit(); } catch (error) { console.error("Error deleting transaction:", error); } } else if (type === 'due') { await deleteDoc(doc(db, 'users', currentUser.uid, 'dues', id)); } });
