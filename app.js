// প্রয়োজনীয় সব ফাংশন সঠিক ভার্সন থেকে ইম্পোর্ট করুন
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, query, onSnapshot, deleteDoc, updateDoc, where, serverTimestamp, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Service Worker রেজিস্টার করুন
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}

// আপনার Firebase কনফিগারেশন (শুধুমাত্র এই একটি জায়গায় থাকবে)
const firebaseConfig = {
    apiKey: "AIzaSyCESxz9Tyc0GvcY5PfWcPda0kArYb_6Jvg",
    authDomain: "new-hisab-khata.firebaseapp.com",
    databaseURL: "https://new-hisab-khata-default-rtdb.firebaseio.com",
    projectId: "new-hisab-khata",
    storageBucket: "new-hisab-khata.firebasestorage.app",
    messagingSenderId: "116945944640",
    appId: "1:116945944640:web:8d944c18a0e4daaee19fa5",
    measurementId: "G-R71KCTMZC6"
};

// Firebase ইনিশিয়ালাইজ করুন (শুধুমাত্র একবার)
const app = initializeApp(firebaseConfig);

// এখন Auth এবং Firestore সার্ভিস ইনিশিয়ালাইজ করুন
const auth = getAuth(app);
const db = getFirestore(app);

// Firestore Offline Persistence চালু করুন
enableIndexedDbPersistence(db)
  .catch(err => {
    if (err.code == 'failed-precondition') {
      console.log('Persistence failed, probably multiple tabs open');
    } else if (err.code == 'unimplemented') {
      console.log('Persistence is not available in this browser');
    }
  });

// --- বাকি সমস্ত JavaScript কোড ---

const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const setupScreen = document.getElementById('setup-screen');
const mainApp = document.getElementById('main-app');
const loginBtn = document.getElementById('login-btn');
const signupLink = document.getElementById('signup-link');
const logoutBtn = document.getElementById('logout-btn');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const initialOnlineBalanceInput = document.getElementById('initial-online-balance');
const initialCashBalanceInput = document.getElementById('initial-cash-balance');
const saveInitialBalanceBtn = document.getElementById('save-initial-balance');
const onlineBalanceEl = document.getElementById('online-balance');
const cashBalanceEl = document.getElementById('cash-balance');
const totalBalanceEl = document.getElementById('total-balance');
const todayIncomeEl = document.getElementById('today-income');
const todayExpenseEl = document.getElementById('today-expense');
const categorySelect = document.getElementById('category');
const amountInput = document.getElementById('amount');
const descriptionInput = document.getElementById('description');
const customerNameInput = document.getElementById('customer-name');
const addTransactionBtn = document.getElementById('add-transaction-btn');
const transactionsUl = document.getElementById('transactions');
const duesUl = document.getElementById('dues');
let currentUser;
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authContainer.style.display = 'none';
        appContainer.style.display = 'block';
        checkInitialBalance();
    } else {
        currentUser = null;
        authContainer.style.display = 'block';
        appContainer.style.display = 'none';
        mainApp.style.display = 'none';
        setupScreen.style.display = 'none';
    }
});
loginBtn.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    signInWithEmailAndPassword(auth, email, password).catch(error => {
        console.error("Login Error:", error);
        alert(`Login Failed: ${error.message}`);
    });
});
signupLink.addEventListener('click', (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;
    createUserWithEmailAndPassword(auth, email, password).catch(error => {
        console.error("Signup Error:", error);
        alert(`Signup Failed: ${error.message}`);
    });
});
logoutBtn.addEventListener('click', () => {
    signOut(auth);
});
async function checkInitialBalance() {
    const balanceDocRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    const balanceDoc = await getDoc(balanceDocRef);
    if (balanceDoc.exists()) {
        setupScreen.style.display = 'none';
        mainApp.style.display = 'block';
        loadDashboardData();
        loadTransactions();
    } else {
        setupScreen.style.display = 'block';
        mainApp.style.display = 'none';
    }
}
saveInitialBalanceBtn.addEventListener('click', async () => {
    const online = parseFloat(initialOnlineBalanceInput.value) || 0;
    const cash = parseFloat(initialCashBalanceInput.value) || 0;
    if (isNaN(online) || isNaN(cash)) {
        return alert("Please enter valid numbers for balance.");
    }
    const balanceDocRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    await setDoc(balanceDocRef, {
        online,
        cash
    });
    setupScreen.style.display = 'none';
    mainApp.style.display = 'block';
    loadDashboardData();
    loadTransactions();
});
function loadDashboardData() {
    const balanceDocRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    onSnapshot(balanceDocRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            onlineBalanceEl.textContent = `৳${data.online.toFixed(2)}`;
            cashBalanceEl.textContent = `৳${data.cash.toFixed(2)}`;
            totalBalanceEl.textContent = `৳${(data.online + data.cash).toFixed(2)}`;
        }
    });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const transactionsQuery = query(collection(db, 'users', currentUser.uid, 'transactions'), where('timestamp', '>=', todayStart));
    onSnapshot(transactionsQuery, (snapshot) => {
        let income = 0;
        let expense = 0;
        snapshot.forEach(doc => {
            const transaction = doc.data();
            if (transaction.type === 'income') {
                income += transaction.amount;
            } else if (transaction.type === 'expense') {
                expense += transaction.amount;
            }
        });
        todayIncomeEl.textContent = `৳${income.toFixed(2)}`;
        todayExpenseEl.textContent = `৳${expense.toFixed(2)}`;
    });
}
categorySelect.addEventListener('change', () => {
    customerNameInput.style.display = categorySelect.value === 'due' ? 'block' : 'none';
});
addTransactionBtn.addEventListener('click', async () => {
    const category = categorySelect.value;
    const amount = parseFloat(amountInput.value);
    const description = descriptionInput.value;
    const customerName = customerNameInput.value;
    if (!amount || amount <= 0) {
        return alert('Please enter a valid amount.');
    }
    const transactionData = {
        category,
        amount,
        description,
        timestamp: serverTimestamp()
    };
    if (category === 'due') {
        if (!customerName) {
            return alert('Please enter a customer name for due.');
        }
        transactionData.customerName = customerName;
        transactionData.paid = false;
        transactionData.type = 'due';
    } else if (category.includes('income')) {
        transactionData.type = 'income';
    } else if (category.includes('expense')) {
        transactionData.type = 'expense';
    }
    try {
        await addDoc(collection(db, 'users', currentUser.uid, 'transactions'), transactionData);
        if (category !== 'due') {
            const balanceDocRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
            const balanceDoc = await getDoc(balanceDocRef);
            if (balanceDoc.exists()) {
                const currentBalance = balanceDoc.data();
                let {
                    online: newOnline,
                    cash: newCash
                } = currentBalance;
                if (category === 'online-income') newOnline += amount;
                if (category === 'cash-income') newCash += amount;
                if (category === 'online-expense') newOnline -= amount;
                if (category === 'cash-expense') newCash -= amount;
                await updateDoc(balanceDocRef, {
                    online: newOnline,
                    cash: newCash
                });
            }
        }
        amountInput.value = '';
        descriptionInput.value = '';
        customerNameInput.value = '';
        customerNameInput.style.display = 'none';
    } catch (error) {
        console.error("Transaction Error:", error);
        alert(`Failed to add transaction: ${error.message}`);
    }
});
function loadTransactions() {
    const transactionsQuery = query(collection(db, 'users', currentUser.uid, 'transactions'));
    onSnapshot(transactionsQuery, (snapshot) => {
        transactionsUl.innerHTML = '';
        duesUl.innerHTML = '';
        snapshot.forEach(doc => {
            const transaction = doc.data();
            const li = document.createElement('li');
            let details = `${transaction.category}: ৳${transaction.amount}`;
            if (transaction.customerName) details += ` - ${transaction.customerName}`;
            if (transaction.description) details += ` (${transaction.description})`;
            li.innerHTML = `
                <span>${details}</span>
                <button class="delete-btn" data-id="${doc.id}">Delete</button>
            `;
            if (transaction.category === 'due') {
                duesUl.appendChild(li);
            } else {
                transactionsUl.appendChild(li);
            }
        });
    });
}
appContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-btn')) {
        if (!confirm("Are you sure you want to delete this transaction?")) return;
        const id = e.target.dataset.id;
        const transactionDocRef = doc(db, 'users', currentUser.uid, 'transactions', id);
        try {
            const transactionDoc = await getDoc(transactionDocRef);
            if (transactionDoc.exists()) {
                const transaction = transactionDoc.data();
                if (transaction.category !== 'due') {
                    const balanceDocRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
                    const balanceDoc = await getDoc(balanceDocRef);
                    if (balanceDoc.exists()) {
                        const currentBalance = balanceDoc.data();
                        let {
                            online: newOnline,
                            cash: newCash
                        } = currentBalance;
                        if (transaction.category === 'online-income') newOnline -= transaction.amount;
                        if (transaction.category === 'cash-income') newCash -= transaction.amount;
                        if (transaction.category === 'online-expense') newOnline += transaction.amount;
                        if (transaction.category === 'cash-expense') newCash += transaction.amount;
                        await updateDoc(balanceDocRef, {
                            online: newOnline,
                            cash: newCash
                        });
                    }
                }
            }
            await deleteDoc(transactionDocRef);
        } catch (error) {
            console.error("Delete Error:", error);
            alert(`Failed to delete transaction: ${error.message}`);
        }
    }
});
