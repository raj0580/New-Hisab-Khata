import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, query, onSnapshot, deleteDoc, updateDoc, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// আপনার Firebase প্রজেক্টের কনফিগারেশন এখানে পেস্ট করুন
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Firebase ইনিশিয়ালাইজ করুন
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
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

// Auth State Change Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authContainer.style.display = 'none';
        appContainer.style.display = 'block';
        checkInitialBalance();
        loadDashboardData();
        loadTransactions();
    } else {
        currentUser = null;
        authContainer.style.display = 'block';
        appContainer.style.display = 'none';
    }
});

// Login and Signup
loginBtn.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    signInWithEmailAndPassword(auth, email, password).catch(error => alert(error.message));
});

signupLink.addEventListener('click', (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;
    createUserWithEmailAndPassword(auth, email, password).catch(error => alert(error.message));
});

// Logout
logoutBtn.addEventListener('click', () => {
    signOut(auth);
});

// Check for initial balance
async function checkInitialBalance() {
    const balanceDocRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    const balanceDoc = await getDoc(balanceDocRef);
    if (balanceDoc.exists()) {
        setupScreen.style.display = 'none';
        mainApp.style.display = 'block';
    } else {
        setupScreen.style.display = 'block';
        mainApp.style.display = 'none';
    }
}

// Save initial balance
saveInitialBalanceBtn.addEventListener('click', async () => {
    const online = parseFloat(initialOnlineBalanceInput.value) || 0;
    const cash = parseFloat(initialCashBalanceInput.value) || 0;

    const balanceDocRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    await setDoc(balanceDocRef, { online, cash });

    setupScreen.style.display = 'none';
    mainApp.style.display = 'block';
    loadDashboardData();
});

// Load dashboard data
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const transactionsQuery = query(collection(db, 'users', currentUser.uid, 'transactions'), where('timestamp', '>=', today));
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

// Category change handler
categorySelect.addEventListener('change', () => {
    if (categorySelect.value === 'due') {
        customerNameInput.style.display = 'block';
    } else {
        customerNameInput.style.display = 'none';
    }
});

// Add transaction
addTransactionBtn.addEventListener('click', async () => {
    const category = categorySelect.value;
    const amount = parseFloat(amountInput.value);
    const description = descriptionInput.value;
    const customerName = customerNameInput.value;

    if (!amount) {
        alert('Please enter an amount.');
        return;
    }

    const transactionData = {
        category,
        amount,
        description,
        timestamp: serverTimestamp()
    };

    if (category === 'due') {
        if (!customerName) {
            alert('Please enter a customer name for due.');
            return;
        }
        transactionData.customerName = customerName;
        transactionData.paid = false;
    }

    if (category.includes('income')) {
        transactionData.type = 'income';
    } else if (category.includes('expense')) {
        transactionData.type = 'expense';
    }

    // Add transaction to Firestore
    await addDoc(collection(db, 'users', currentUser.uid, 'transactions'), transactionData);

    // Update balance
    const balanceDocRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    const balanceDoc = await getDoc(balanceDocRef);
    if (balanceDoc.exists()) {
        const currentBalance = balanceDoc.data();
        let newOnline = currentBalance.online;
        let newCash = currentBalance.cash;

        if (category === 'online-income') newOnline += amount;
        if (category === 'cash-income') newCash += amount;
        if (category === 'online-expense') newOnline -= amount;
        if (category === 'cash-expense') newCash -= amount;

        await updateDoc(balanceDocRef, { online: newOnline, cash: newCash });
    }

    // Clear form
    amountInput.value = '';
    descriptionInput.value = '';
    customerNameInput.value = '';
});

// Load transactions and dues
function loadTransactions() {
    const transactionsQuery = query(collection(db, 'users', currentUser.uid, 'transactions'));
    onSnapshot(transactionsQuery, (snapshot) => {
        transactionsUl.innerHTML = '';
        duesUl.innerHTML = '';
        snapshot.forEach(doc => {
            const transaction = doc.data();
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${transaction.category}: ৳${transaction.amount} ${transaction.description ? `(${transaction.description})` : ''}</span>
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

// Delete transaction
appContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-btn')) {
        const id = e.target.dataset.id;
        const transactionDocRef = doc(db, 'users', currentUser.uid, 'transactions', id);
        
        // Get transaction to revert balance
        const transactionDoc = await getDoc(transactionDocRef);
        if (transactionDoc.exists()) {
            const transaction = transactionDoc.data();
            
            const balanceDocRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
            const balanceDoc = await getDoc(balanceDocRef);
            if (balanceDoc.exists()) {
                const currentBalance = balanceDoc.data();
                let newOnline = currentBalance.online;
                let newCash = currentBalance.cash;

                if (transaction.category === 'online-income') newOnline -= transaction.amount;
                if (transaction.category === 'cash-income') newCash -= transaction.amount;
                if (transaction.category === 'online-expense') newOnline += transaction.amount;
                if (transaction.category === 'cash-expense') newCash += transaction.amount;

                await updateDoc(balanceDocRef, { online: newOnline, cash: newCash });
            }
        }
        
        await deleteDoc(transactionDocRef);
    }
});
