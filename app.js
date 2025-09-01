// ধাপ ১: প্রয়োজনীয় সব ফাংশন ইম্পোর্ট করুন
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, query, onSnapshot, deleteDoc, updateDoc, where, serverTimestamp, enableIndexedDbPersistence, writeBatch, Timestamp, orderBy, runTransaction } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// ধাপ ২: Service Worker ও Firebase ইনিশিয়ালাইজেশন
if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js')); }
const firebaseConfig = { apiKey: "AIzaSyCESxz9Tyc0GvcY5PfWcPda0kArYb_6Jvg", authDomain: "new-hisab-khata.firebaseapp.com", projectId: "new-hisab-khata", storageBucket: "new-hisab-khata.firebasestorage.app", appId: "1:116945944640:web:8d944c18a0e4daaee19fa5" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
enableIndexedDbPersistence(db).catch(err => console.error("Persistence error: ", err.code));

// ধাপ ৩: DOM Elements
const authContainer = document.getElementById('auth-container'), appContainer = document.getElementById('app-container'), setupScreen = document.getElementById('setup-screen'), mainApp = document.getElementById('main-app'), loginBtn = document.getElementById('login-btn'), signupLink = document.getElementById('signup-link'), logoutBtn = document.getElementById('logout-btn'), emailInput = document.getElementById('email'), passwordInput = document.getElementById('password'), datePicker = document.getElementById('date-picker'), categorySelect = document.getElementById('category'), customerNameInput = document.getElementById('customer-name'), transactionForm = document.getElementById('transaction-form'), saveInitialBalanceBtn = document.getElementById('save-initial-balance'), skipBalanceSetupBtn = document.getElementById('skip-balance-setup'), modal = document.getElementById('due-details-modal');
let currentUser, currentOpenDueId, hasCheckedBalance = false;

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
    if(datePicker) { datePicker.valueAsDate = new Date(); loadDashboardData(); loadTransactionsForDate(datePicker.valueAsDate); loadAllDues(); }
}
saveInitialBalanceBtn.addEventListener('click', async () => {
    const online = parseFloat(document.getElementById('initial-online-balance').value) || 0;
    const cash = parseFloat(document.getElementById('initial-cash-balance').value) || 0;
    await setDoc(doc(db, 'users', currentUser.uid, 'balance', 'main'), { online, cash }); showMainApp();
});
skipBalanceSetupBtn.addEventListener('click', async () => { await setDoc(doc(db, 'users', currentUser.uid, 'balance', 'main'), { online: 0, cash: 0 }); showMainApp(); });

// ধাপ ৫: Data Loading
datePicker.addEventListener('change', () => loadTransactionsForDate(datePicker.valueAsDate));
function loadDashboardData() { /* ... unchanged ... */ }
function loadTransactionsForDate(selectedDate) { /* ... unchanged ... */ }
function loadAllDues() { /* ... unchanged ... */ }

// ধাপ ৬: Add Transaction (Advanced Due Logic)
categorySelect.addEventListener('change', () => customerNameInput.style.display = categorySelect.value === 'due' ? 'block' : 'none');
document.getElementById('add-transaction-btn').addEventListener('click', async () => {
    const category = categorySelect.value;
    const amount = parseFloat(document.getElementById('amount').value);
    const description = document.getElementById('description').value;
    if (!amount || amount <= 0) return alert('সঠিক পরিমাণ দিন।');
    if (!description) return alert('আইটেমের নাম/বর্ণনা দিন।');

    if (category === 'due') {
        const customerName = customerNameInput.value;
        if (!customerName) return alert('কাস্টমারের নাম দিন।');
        
        // Check if a due already exists for this customer
        const q = query(collection(db, 'users', currentUser.uid, 'dues'), where('customerName', '==', customerName), where('status', '!=', 'paid'));
        const existingDueSnap = await getDocs(q);
        
        let dueRef;
        if (existingDueSnap.empty) {
            // No existing due, create a new one
            dueRef = await addDoc(collection(db, 'users', currentUser.uid, 'dues'), {
                customerName, totalAmount: 0, paidAmount: 0, remainingAmount: 0,
                lastUpdatedAt: serverTimestamp(), status: 'unpaid'
            });
        } else {
            dueRef = existingDueSnap.docs[0].ref;
        }
        
        // Add item to the 'items' subcollection and update totals using a transaction
        await runTransaction(db, async (transaction) => {
            const dueDoc = await transaction.get(dueRef);
            if (!dueDoc.exists()) throw "Due document does not exist!";
            
            const newTotal = dueDoc.data().totalAmount + amount;
            const newRemaining = dueDoc.data().remainingAmount + amount;

            transaction.update(dueRef, { 
                totalAmount: newTotal, 
                remainingAmount: newRemaining,
                lastUpdatedAt: serverTimestamp() 
            });
            
            const newItemRef = doc(collection(dueRef, 'items'));
            transaction.set(newItemRef, { name: description, amount: amount, date: serverTimestamp() });
        });

    } else { // Handle regular income/expense
        // ... unchanged ...
    }
    transactionForm.reset(); customerNameInput.style.display = 'none';
});

// ধাপ ৭: Advanced Due Modal
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
        
        // Load Items
        const itemsQuery = query(collection(dueRef, 'items'), orderBy('date', 'desc'));
        onSnapshot(itemsQuery, i_snap => {
            const itemListUl = document.getElementById('modal-item-list');
            itemListUl.innerHTML = '';
            i_snap.forEach(i_doc => {
                const item = i_doc.data();
                const dateStr = item.date ? item.date.toDate().toLocaleDateString() : 'N/A';
                itemListUl.innerHTML += `<li><span>${item.name} (${dateStr})</span><span>৳${item.amount.toFixed(2)}</span></li>`;
            });
        });
        
        // Load Payments
        const paymentsQuery = query(collection(dueRef, 'payments'), orderBy('paymentDate', 'desc'));
        onSnapshot(paymentsQuery, p_snap => { /* ... unchanged ... */ });
    });
    modal.style.display = 'block';
});
document.querySelector('.close-btn').onclick = () => modal.style.display = 'none';

// Add new item to existing due
document.getElementById('add-item-btn').addEventListener('click', async () => { /* ... Logic similar to Add Transaction's due part ... */ });
// Add new payment to existing due
document.getElementById('add-payment-btn').addEventListener('click', async () => { /* ... unchanged ... */ });
// Delete transaction logic
mainApp.addEventListener('click', async (e) => { /* ... unchanged ... */ });
