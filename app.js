import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, query, onSnapshot, deleteDoc, updateDoc, where, serverTimestamp, enableIndexedDbPersistence, writeBatch, Timestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// আগের মতোই সার্ভিস ওয়ার্কার এবং Firebase ইনিশিয়ালাইজেশন
if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js')); }
const firebaseConfig = { apiKey: "AIzaSyCESxz9Tyc0GvcY5PfWcPda0kArYb_6Jvg", authDomain: "new-hisab-khata.firebaseapp.com", databaseURL: "https://new-hisab-khata-default-rtdb.firebaseio.com", projectId: "new-hisab-khata", storageBucket: "new-hisab-khata.firebasestorage.app", messagingSenderId: "116945944640", appId: "1:116945944640:web:8d944c18a0e4daaee19fa5", measurementId: "G-R71KCTMZC6" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
enableIndexedDbPersistence(db).catch(err => console.log("Persistence error: ", err.code));

// DOM Elements... (বাকি সব আগের মতোই)
let currentUser;
const datePicker = document.getElementById('date-picker');

// Auth State Listener
onAuthStateChanged(auth, user => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'block';
        checkInitialBalance();
        // তারিখ আজকে সেট করুন এবং ডেটা লোড করুন
        datePicker.valueAsDate = new Date();
        loadAllDataForDate(datePicker.valueAsDate);
    } else {
        // ... logout logic
    }
});

// তারিখ পরিবর্তন হলে ডেটা আবার লোড করুন
datePicker.addEventListener('change', () => {
    loadAllDataForDate(datePicker.valueAsDate);
});

// *** নতুন ফাংশন: নির্দিষ্ট তারিখের জন্য সব ডেটা লোড করে ***
function loadAllDataForDate(selectedDate) {
    if (!currentUser) return;
    
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // ১. সাধারণ লেনদেন (আয়-ব্যয়) লোড করুন
    const transQuery = query(
        collection(db, 'users', currentUser.uid, 'transactions'),
        where('timestamp', '>=', startOfDay),
        where('timestamp', '<=', endOfDay)
    );
    onSnapshot(transQuery, snapshot => {
        let dailyIncome = 0;
        let dailyExpense = 0;
        const transactionsHtml = [];

        snapshot.forEach(doc => {
            const t = doc.data();
            if (t.type === 'income') dailyIncome += t.amount;
            if (t.type === 'expense') dailyExpense += t.amount;
            
            transactionsHtml.push(`
                <li>
                    <span>${t.category}: ৳${t.amount} (${t.description})</span>
                    <button class="delete-btn" data-id="${doc.id}" data-type="transaction">🗑️</button>
                </li>
            `);
        });

        document.getElementById('today-income').textContent = `৳${dailyIncome.toFixed(2)}`;
        document.getElementById('today-expense').textContent = `৳${dailyExpense.toFixed(2)}`;
        document.getElementById('transactions-list-ul').innerHTML = transactionsHtml.join('');
    });

    // ২. ডিউ (বকেয়া) তালিকা লোড করুন (এটি তারিখ নিরপেক্ষ)
    const dueQuery = query(collection(db, 'users', currentUser.uid, 'dues'));
    onSnapshot(dueQuery, snapshot => {
        const duesByCustomer = {}; // একই কাস্টমারের সব ডিউ একত্রিত করার জন্য

        snapshot.forEach(doc => {
            const due = doc.data();
            if (!duesByCustomer[due.customerName]) {
                duesByCustomer[due.customerName] = { totalRemaining: 0, docs: [] };
            }
            duesByCustomer[due.customerName].totalRemaining += due.remainingAmount;
            duesByCustomer[due.customerName].docs.push({ id: doc.id, ...due });
        });

        const dueListHtml = Object.keys(duesByCustomer).map(name => {
            const customer = duesByCustomer[name];
            return `
                <li data-customer-name="${name}">
                    <span><strong>${name}</strong> - মোট বকেয়া: ৳${customer.totalRemaining.toFixed(2)}</span>
                    <button class="view-due-btn">বিস্তারিত</button>
                </li>
            `;
        }).join('');
        document.getElementById('due-list-ul').innerHTML = dueListHtml;
    });

    // ৩. ব্যালেন্স লোড করুন (এটিও তারিখ নিরপেক্ষ)
    const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
    onSnapshot(balanceRef, doc => {
        if (doc.exists()) {
            const data = doc.data();
            // ... update balance UI
        }
    });
}

// *** নতুন লেনদেন যোগ করার উন্নত ফাংশন ***
document.getElementById('add-transaction-btn').addEventListener('click', async () => {
    const category = document.getElementById('category').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const description = document.getElementById('description').value;
    
    if (category === 'due') {
        // ডিউ হলে নতুন `dues` কালেকশনে যোগ করুন
        const customerName = document.getElementById('customer-name').value;
        await addDoc(collection(db, 'users', currentUser.uid, 'dues'), {
            customerName,
            totalAmount: amount,
            paidAmount: 0,
            remainingAmount: amount,
            items: description,
            createdAt: serverTimestamp(),
            status: 'unpaid'
        });
    } else {
        // আয় বা ব্যয় হলে `transactions` কালেকশনে যোগ করুন
        const type = category.includes('income') ? 'income' : 'expense';
        await addDoc(collection(db, 'users', currentUser.uid, 'transactions'), {
            category, amount, description, type,
            timestamp: serverTimestamp()
        });
        
        // ব্যালেন্স আপডেট করুন
        const balanceRef = doc(db, 'users', currentUser.uid, 'balance', 'main');
        const balanceDoc = await getDoc(balanceRef);
        if (balanceDoc.exists()) {
            const balance = balanceDoc.data();
            if (category === 'online-income') balance.online += amount;
            if (category === 'cash-income') balance.cash += amount;
            if (category === 'online-expense') balance.online -= amount;
            if (category === 'cash-expense') balance.cash -= amount;
            await updateDoc(balanceRef, balance);
        }
    }
    // Form reset
});

// *** ডিউ মডাল এবং পেমেন্ট লজিক ***
const modal = document.getElementById('due-details-modal');
let currentDueData = {};

// "বিস্তারিত" বাটনে ক্লিক করলে মডাল খুলবে
document.getElementById('due-list-ul').addEventListener('click', async e => {
    if (e.target.classList.contains('view-due-btn')) {
        const customerName = e.target.closest('li').dataset.customerName;
        // এখানে আমরা একটি কাস্টমারের প্রথম unpaid ডিউ টি দেখাব (উন্নত করা যেতে পারে)
        const q = query(collection(db, 'users', currentUser.uid, 'dues'), where('customerName', '==', customerName), where('status', '!=', 'paid'));
        onSnapshot(q, snapshot => {
            if (!snapshot.empty) {
                const dueDoc = snapshot.docs[0]; // আপাতত প্রথমটি নিচ্ছি
                currentDueData = { id: dueDoc.id, ...dueDoc.data() };
                
                document.getElementById('modal-customer-name').textContent = currentDueData.customerName;
                document.getElementById('modal-remaining-due').textContent = `৳${currentDueData.remainingAmount.toFixed(2)}`;
                modal.style.display = 'block';

                // পেমেন্ট ইতিহাস লোড করুন
                const paymentsQuery = query(collection(db, 'users', currentUser.uid, 'dues', currentDueData.id, 'payments'));
                onSnapshot(paymentsQuery, p_snapshot => {
                    const historyHtml = p_snapshot.docs.map(p_doc => {
                        const payment = p_doc.data();
                        return `<li>${payment.paymentDate.toDate().toLocaleDateString()}: ৳${payment.amount}</li>`;
                    }).join('');
                    document.getElementById('modal-payment-history').innerHTML = historyHtml;
                });
            }
        });
    }
});

// মডাল বন্ধ করার বাটন
document.querySelector('.close-btn').onclick = () => modal.style.display = 'none';

// নতুন পেমেন্ট যোগ করার বাটন
document.getElementById('add-payment-btn').addEventListener('click', async () => {
    const paymentAmount = parseFloat(document.getElementById('new-payment-amount').value);
    if (!paymentAmount || paymentAmount <= 0) return alert('সঠিক পরিমাণ দিন');

    const dueRef = doc(db, 'users', currentUser.uid, 'dues', currentDueData.id);
    const newPaid = currentDueData.paidAmount + paymentAmount;
    const newRemaining = currentDueData.totalAmount - newPaid;
    
    await updateDoc(dueRef, {
        paidAmount: newPaid,
        remainingAmount: newRemaining,
        status: newRemaining <= 0 ? 'paid' : 'partially-paid'
    });

    await addDoc(collection(dueRef, 'payments'), {
        amount: paymentAmount,
        paymentDate: serverTimestamp()
    });

    modal.style.display = 'none';
});

// বাকি ফাংশনগুলো (login, signup, checkInitialBalance, etc.) আগের মতোই থাকবে...
