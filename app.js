document.addEventListener('DOMContentLoaded', () => {

    // Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCESxz9Tyc0GvcY5PfWcPda0kArYb_6Jvg",
  authDomain: "new-hisab-khata.firebaseapp.com",
  projectId: "new-hisab-khata",
  storageBucket: "new-hisab-khata.firebasestorage.app",
  messagingSenderId: "116945944640",
  appId: "1:116945944640:web:8d944c18a0e4daaee19fa5",
  measurementId: "G-R71KCTMZC6"
};


    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();

    // DOM Elements
    const mainContent = document.getElementById('app-main-content');
    const appTitle = document.getElementById('app-title');
    const modalContainer = document.getElementById('modal-container');
    const bottomNav = document.getElementById('bottom-nav');
    const logoutBtn = document.getElementById('logout-btn');

    // App State
    let currentUser = null;
    let todayString = new Date().toISOString().slice(0, 10);

    // Helper Functions
    const formatCurrency = (amount) => `৳ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatDate = (timestamp) => timestamp ? new Date(timestamp.seconds * 1000).toLocaleDateString('bn-BD') : '';
    const showLoader = () => mainContent.innerHTML = `<div class="loader-container"><div class="loader"></div></div>`;
    const hideModal = () => modalContainer.classList.remove('visible');

    // Authentication Logic
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            logoutBtn.style.display = 'block';
            bottomNav.style.display = 'flex';
            checkInitialBalance();
        } else {
            currentUser = null;
            logoutBtn.style.display = 'none';
            bottomNav.style.display = 'none';
            renderLoginUI();
        }
    });

    const renderLoginUI = () => {
        mainContent.innerHTML = `
            <div style="text-align: center; padding-top: 50px;">
                <h2>ডিজিটাল হিসাব খাতায় স্বাগতম</h2>
                <p>শুরু করতে অনুগ্রহ করে গুগল দিয়ে লগইন করুন।</p>
                <button id="login-btn" class="btn">গুগল দিয়ে লগইন করুন</button>
            </div>
        `;
        document.getElementById('login-btn').addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider);
        });
    };
    
    logoutBtn.addEventListener('click', () => auth.signOut());

    const checkInitialBalance = async () => {
        const userRef = db.collection('users').doc(currentUser.uid);
        const userDoc = await userRef.get();
        if (!userDoc.exists || !userDoc.data().initialBalanceSet) {
            renderInitialBalanceForm();
        } else {
            switchPage('dashboard');
        }
    };

    const renderInitialBalanceForm = () => {
        modalContainer.innerHTML = `
            <div class="modal-content">
                <div class="modal-header"><h2>শুরুর ব্যালেন্স সেট করুন</h2></div>
                <form id="initial-balance-form" class="form-container">
                    <p>অ্যাপটি ব্যবহারের আগে আপনার বর্তমান ক্যাশ ও অনলাইন ব্যালেন্স দিন।</p>
                    <div class="form-group"><label for="start-cash">হাতে ক্যাশ কত আছে?</label><input type="number" id="start-cash" value="0" required></div>
                    <div class="form-group"><label for="start-online">অনলাইন একাউন্টে কত আছে?</label><input type="number" id="start-online" value="0" required></div>
                    <button type="submit" class="btn">শুরু করুন</button>
                </form>
            </div>
        `;
        modalContainer.classList.add('visible');
    };

    // Page Rendering
    const switchPage = (page, params = {}) => {
        if (!currentUser) return renderLoginUI();
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const activeNavItem = document.querySelector(`.nav-item[data-page="${page}"]`);
        if(activeNavItem) activeNavItem.classList.add('active');

        appTitle.textContent = document.querySelector(`[data-page="${page}"]`).dataset.title;

        if (page === 'dashboard') renderDashboard();
        if (page === 'dueManager') renderDueManager();
        if (page === 'customerProfile') renderCustomerProfile(params.customerId);
        if (page === 'transactions') renderAllTransactions();
    };

    const renderDashboard = async () => {
        showLoader();
        // This is a simplified dashboard. A full version would calculate daily summaries.
        mainContent.innerHTML = `
             <div class="dashboard-grid">
                <div class="stat-card"><h3>এই ফিচারটি তৈরি করা হচ্ছে</h3><p class="amount">শীঘ্রই আসছে</p></div>
            </div>
        `;
    };

    const renderDueManager = async () => {
        showLoader();
        const snapshot = await db.collection('customers').where('userId', '==', currentUser.uid).where('isActive', '==', true).orderBy('totalDue', 'desc').get();
        const customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        mainContent.innerHTML = `
            <div class="customer-list">
                ${customers.length === 0 ? `<p style="text-align:center;">কোনো কাস্টমারের বাকি নেই।</p>` :
                customers.map(cust => `
                    <div class="customer-item" data-customer-id="${cust.id}">
                        <div class="customer-info">
                            <p class="name">${cust.name}</p>
                            <p class="phone">${cust.phone || 'N/A'}</p>
                        </div>
                        <p class="amount total-due">${formatCurrency(cust.totalDue)}</p>
                    </div>
                `).join('')}
            </div>
        `;
    };

    const renderCustomerProfile = async (customerId) => {
        showLoader();
        const customerRef = db.collection('customers').doc(customerId);
        const customerDoc = await customerRef.get();
        const customer = { id: customerDoc.id, ...customerDoc.data() };

        const txSnapshot = await db.collection('transactions')
            .where('customerId', '==', customerId)
            .where('isActive', '==', true)
            .orderBy('timestamp', 'desc').get();
        const transactions = txSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        mainContent.innerHTML = `
            <div class="customer-profile-header">
                <h2>${customer.name}</h2>
                <p>${customer.phone || 'ফোন নম্বর নেই'}</p>
                <div class="total-due-display">${formatCurrency(customer.totalDue)}</div>
            </div>
            <form id="receive-due-form" class="form-container" style="margin-bottom: 1.5rem;">
                <div class="form-group">
                    <label for="amount-received">আজ দিল (টাকা)</label>
                    <input type="number" id="amount-received" placeholder="টাকার পরিমাণ লিখুন" required>
                </div>
                <button type="submit" class="btn">জমা করুন</button>
            </form>
            <h3>লেনদেনের তালিকা</h3>
            <div class="transaction-list">
                ${transactions.length === 0 ? `<p>কোনো লেনদেন নেই।</p>` :
                transactions.map(tx => `
                    <div class="transaction-item">
                        <div class="transaction-icon ${tx.type === 'due_add' ? 'due' : 'in'}">${tx.type === 'due_add' ? 'DA' : 'DR'}</div>
                        <div class="transaction-details">
                            <p class="transaction-reason">${tx.reason}</p>
                            <p class="transaction-meta">${formatDate(tx.timestamp)}</p>
                        </div>
                        <p class="transaction-amount">${formatCurrency(tx.amount)}</p>
                        <button class="delete-btn" data-tx-id="${tx.id}" data-tx-amount="${tx.amount}" data-tx-type="${tx.type}">&#10005;</button>
                    </div>
                `).join('')}
            </div>
        `;
        document.getElementById('receive-due-form').dataset.customerId = customerId;
    };
    
    const renderAllTransactions = async () => {
        showLoader();
         mainContent.innerHTML = `
             <div class="dashboard-grid">
                <div class="stat-card"><h3>এই ফিচারটি তৈরি করা হচ্ছে</h3><p class="amount">শীঘ্রই আসছে</p></div>
            </div>
        `;
    }

    const renderAddDueForm = () => {
        modalContainer.innerHTML = `
            <div class="modal-content">
                <div class="modal-header"><h2>বাকিতে বিক্রয়</h2><button class="modal-close-btn" data-action="close-modal">&times;</button></div>
                <form id="due-form" class="form-container">
                    <div class="form-group"><label for="customer-name">কাস্টমারের নাম</label><input type="text" id="customer-name" required></div>
                    <div class="form-group"><label for="customer-phone">ফোন (ঐচ্ছিক)</label><input type="tel" id="customer-phone"></div>
                    <div class="form-group"><label for="reason">বিবরণ (যেমন: রিচার্জ)</label><input type="text" id="reason" required></div>
                    <div class="form-group"><label for="total-bill">মোট বিল</label><input type="number" id="total-bill" required></div>
                    <div class="form-group"><label for="amount-paid">জমা দিল</label><input type="number" id="amount-paid" value="0" required></div>
                    <div class="due-calculation">
                        <p><span>মোট বিল:</span><span id="display-total">৳ 0.00</span></p>
                        <p><span>জমা:</span><span id="display-paid">৳ 0.00</span></p>
                        <p class="final-due"><span>বাকি থাকবে:</span><span id="display-due">৳ 0.00</span></p>
                    </div>
                    <button type="submit" class="btn">সেভ করুন</button>
                </form>
            </div>
        `;
        modalContainer.classList.add('visible');
        ['total-bill', 'amount-paid'].forEach(id => document.getElementById(id).addEventListener('input', updateDueCalculation));
    };

    function updateDueCalculation() {
        const total = parseFloat(document.getElementById('total-bill').value) || 0;
        const paid = parseFloat(document.getElementById('amount-paid').value) || 0;
        document.getElementById('display-total').textContent = formatCurrency(total);
        document.getElementById('display-paid').textContent = formatCurrency(paid);
        document.getElementById('display-due').textContent = formatCurrency(total - paid);
    }
    
    // Data Handling Logic
    const handleSaveInitialBalance = async (e) => {
        e.preventDefault();
        const cash = parseFloat(document.getElementById('start-cash').value);
        const online = parseFloat(document.getElementById('start-online').value);
        
        const userRef = db.collection('users').doc(currentUser.uid);
        await userRef.set({ initialBalanceSet: true, openingCash: cash, openingOnline: online }, { merge: true });

        hideModal();
        switchPage('dashboard');
    };

    const handleSaveDueTransaction = async (e) => {
        e.preventDefault();
        const batch = db.batch();
        const totalBill = parseFloat(document.getElementById('total-bill').value);
        const amountPaid = parseFloat(document.getElementById('amount-paid').value);
        const dueAmount = totalBill - amountPaid;
        const customerName = document.getElementById('customer-name').value;
        const customerPhone = document.getElementById('customer-phone').value;
        const reason = document.getElementById('reason').value;

        const customerQuery = await db.collection('customers').where('name', '==', customerName).where('userId', '==', currentUser.uid).get();
        let customerRef;
        if (customerQuery.empty) {
            customerRef = db.collection('customers').doc();
            batch.set(customerRef, { name: customerName, phone: customerPhone, totalDue: dueAmount, userId: currentUser.uid, isActive: true });
        } else {
            customerRef = customerQuery.docs[0].ref;
            batch.update(customerRef, { totalDue: firebase.firestore.FieldValue.increment(dueAmount) });
        }

        if (amountPaid > 0) { /* Paid amount transaction */ }
        
        if (dueAmount > 0) {
            const dueTxRef = db.collection('transactions').doc();
            batch.set(dueTxRef, {
                amount: dueAmount, type: 'due_add', reason, date: todayString,
                customerId: customerRef.id, customerName, userId: currentUser.uid,
                isActive: true, timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        await batch.commit();
        hideModal();
        switchPage('dueManager');
    };
    
    const handleReceiveDue = async (e) => {
        e.preventDefault();
        const customerId = e.target.dataset.customerId;
        const amount = parseFloat(document.getElementById('amount-received').value);
        if (!amount || amount <= 0) return alert("টাকার পরিমাণ সঠিক নয়।");
        
        const batch = db.batch();
        const customerRef = db.collection('customers').doc(customerId);
        batch.update(customerRef, { totalDue: firebase.firestore.FieldValue.increment(-amount) });

        const txRef = db.collection('transactions').doc();
        batch.set(txRef, {
            amount, type: 'due_receive', reason: `বাকি আদায়`, date: todayString,
            customerId, userId: currentUser.uid, isActive: true,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await batch.commit();
        renderCustomerProfile(customerId);
    };

    const handleDeleteTransaction = async (txId, txAmount, txType, customerId) => {
        if (!confirm("আপনি কি এই লেনদেনটি ডিলিট করতে নিশ্চিত?")) return;
        
        const batch = db.batch();
        const txRef = db.collection('transactions').doc(txId);
        batch.update(txRef, { isActive: false });

        const customerRef = db.collection('customers').doc(customerId);
        const increment = txType === 'due_add' ? -txAmount : txAmount;
        batch.update(customerRef, { totalDue: firebase.firestore.FieldValue.increment(increment) });

        await batch.commit();
        renderCustomerProfile(customerId);
    };

    // Event Listeners
    document.body.addEventListener('click', (e) => {
        const pageTarget = e.target.closest('[data-page]');
        const actionTarget = e.target.closest('[data-action]');
        const customerTarget = e.target.closest('[data-customer-id]');
        const deleteBtn = e.target.closest('.delete-btn');

        if (pageTarget) switchPage(pageTarget.dataset.page);
        if (actionTarget) renderAddDueForm();
        if (customerTarget) switchPage('customerProfile', { customerId: customerTarget.dataset.customerId });
        if (deleteBtn) {
            const customerId = document.getElementById('receive-due-form').dataset.customerId;
            handleDeleteTransaction(deleteBtn.dataset.txId, parseFloat(deleteBtn.dataset.txAmount), deleteBtn.dataset.txType, customerId);
        }
    });

    modalContainer.addEventListener('submit', (e) => {
        if (e.target.id === 'initial-balance-form') handleSaveInitialBalance(e);
        if (e.target.id === 'due-form') handleSaveDueTransaction(e);
    });
    
    mainContent.addEventListener('submit', (e) => {
        if (e.target.id === 'receive-due-form') handleReceiveDue(e);
    });

    // Initial Load & Service Worker
    window.addEventListener('load', () => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW registration failed: ', err));
        }
    });
});
