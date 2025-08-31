document.addEventListener('DOMContentLoaded', () => {

    // =========================================================================
    // 🔥 START: FIREBASE CONFIGURATION
    // =========================================================================
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
    // =========================================================================
    // 🔥 END: FIREBASE CONFIGURATION
    // =========================================================================

    // Firebase Initialization
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    // অফলাইনে ডেটা সেভ করার জন্য
    db.enablePersistence().catch(err => console.error("Firestore persistence error: ", err));
    const transactionsCollection = db.collection('transactions');

    // DOM Elements
    const mainContent = document.getElementById('app-main-content');
    const appTitle = document.getElementById('app-title');
    const navItems = document.querySelectorAll('.nav-item');
    const modalContainer = document.getElementById('modal-container');

    let allTransactions = []; // সমস্ত ডেটা এখানে ক্যাশ করা হবে
    
    // =========================================================================
    // 헬 HELPER FUNCTIONS
    // =========================================================================
    const formatCurrency = (amount) => `৳ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatDate = (timestamp) => {
        if (!timestamp) return '...';
        return new Date(timestamp.seconds * 1000).toLocaleString('bn-BD', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };
    const showLoader = () => {
        mainContent.innerHTML = `<div class="loader-container"><div class="loader"></div></div>`;
    };
    const hideModal = () => modalContainer.classList.remove('visible');

    // =========================================================================
    // 📊 CORE LOGIC & CALCULATIONS
    // =========================================================================
    const calculateStats = (transactions) => {
        const stats = {
            cashBalance: 0, onlineBalance: 0, totalDue: 0,
            today: { cashIn: 0, cashOut: 0, onlineIn: 0, onlineOut: 0 }
        };
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        transactions.forEach(tx => {
            const txDate = tx.timestamp ? new Date(tx.timestamp.seconds * 1000) : new Date();
            
            switch(tx.type) {
                case 'starting_balance':
                    if (tx.method === 'cash') stats.cashBalance += tx.amount;
                    if (tx.method === 'online') stats.onlineBalance += tx.amount;
                    break;
                case 'cash_in':
                    stats.cashBalance += tx.amount;
                    if (txDate >= todayStart) stats.today.cashIn += tx.amount;
                    break;
                case 'cash_out':
                    stats.cashBalance -= tx.amount;
                    if (txDate >= todayStart) stats.today.cashOut += tx.amount;
                    break;
                case 'online_in':
                    stats.onlineBalance += tx.amount;
                    if (txDate >= todayStart) stats.today.onlineIn += tx.amount;
                    break;
                case 'online_out':
                    stats.onlineBalance -= tx.amount;
                    if (txDate >= todayStart) stats.today.onlineOut += tx.amount;
                    break;
                case 'exchange_online_to_cash':
                    stats.onlineBalance -= tx.amount;
                    stats.cashBalance += tx.amount;
                    break;
                case 'due_add':
                    stats.totalDue += tx.amount;
                    break;
                case 'due_receive':
                    stats.totalDue -= tx.amount;
                    if(tx.method === 'cash') stats.cashBalance += tx.amount;
                    else stats.onlineBalance += tx.amount;
                    break;
            }
        });
        return stats;
    };

    // =========================================================================
    // 🎨 TEMPLATES / VIEWS
    // =========================================================================
    const renderDashboard = (stats) => {
        mainContent.innerHTML = `
            <div class="dashboard-grid">
                <div class="stat-card"><h3>ক্যাশ ইন (আজ)</h3><p class="amount positive">${formatCurrency(stats.today.cashIn)}</p></div>
                <div class="stat-card"><h3>ক্যাশ আউট (আজ)</h3><p class="amount negative">${formatCurrency(stats.today.cashOut)}</p></div>
                <div class="stat-card"><h3>ক্যাশ ব্যালেন্স</h3><p class="amount">${formatCurrency(stats.cashBalance)}</p></div>
                
                <div class="stat-card"><h3>অনলাইন ইন (আজ)</h3><p class="amount positive">${formatCurrency(stats.today.onlineIn)}</p></div>
                <div class="stat-card"><h3>অনলাইন আউট (আজ)</h3><p class="amount negative">${formatCurrency(stats.today.onlineOut)}</p></div>
                <div class="stat-card"><h3>অনলাইন ব্যালেন্স</h3><p class="amount">${formatCurrency(stats.onlineBalance)}</p></div>

                <div class="stat-card" style="grid-column: 1 / -1;"><h3>মোট বকেয়া (Due)</h3><p class="amount total-due">${formatCurrency(stats.totalDue)}</p></div>
            </div>
            
            <div class="quick-actions">
                <button class="action-btn" data-action="add-transaction" data-type="cash_in">ক্যাশ ইন</button>
                <button class="action-btn" data-action="add-transaction" data-type="cash_out">ক্যাশ আউট</button>
                <button class="action-btn" data-action="add-transaction" data-type="due_add">বাকি দিন</button>
            </div>
            
            <button class="btn daily-close-btn" data-action="reconcile">ক্যাশ মেলানো (Reconcile)</button>
        `;
    };

    const renderTransactionList = (transactions) => {
        if (transactions.length === 0) {
            mainContent.innerHTML = `<p style="text-align:center;">এখনো কোনো লেনদেন হয়নি।</p>`;
            return;
        }

        const listHtml = transactions.map(tx => {
            const typeMap = {
                starting_balance: { class: 'in', icon: 'SB', label: `প্রারম্ভিক ব্যালেন্স (${tx.method})` },
                cash_in: { class: 'in', icon: 'CI', label: 'ক্যাশ ইন' },
                cash_out: { class: 'out', icon: 'CO', label: 'ক্যাশ আউট' },
                online_in: { class: 'in', icon: 'OI', label: 'অনলাইন ইন' },
                online_out: { class: 'out', icon: 'OO', label: 'অনলাইন আউট' },
                exchange_online_to_cash: { class: 'exchange', icon: 'EX', label: 'এক্সচেঞ্জ' },
                due_add: { class: 'due', icon: 'DA', label: 'বাকি দেওয়া হয়েছে' },
                due_receive: { class: 'in', icon: 'DR', label: `বাকি আদায় (${tx.method})` }
            };
            const info = typeMap[tx.type] || { class: 'due', icon: '?', label: tx.type };
            const sign = info.class === 'out' ? '-' : '+';
            
            return `
                <div class="transaction-item">
                    <div class="transaction-icon ${info.class}">${info.icon}</div>
                    <div class="transaction-details">
                        <p class="transaction-reason">${tx.reason}</p>
                        <p class="transaction-meta">${info.label} • ${formatDate(tx.timestamp)}</p>
                    </div>
                    <p class="transaction-amount ${info.class}">${sign}${formatCurrency(tx.amount)}</p>
                </div>
            `;
        }).join('');
        
        mainContent.innerHTML = `<div class="transaction-list">${listHtml}</div>`;
    };

    const renderTransactionForm = (type = 'cash_in') => {
        const isExchange = type.startsWith('exchange');
        const isDue = type.startsWith('due');
        
        modalContainer.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>নতুন লেনদেন</h2>
                    <button class="modal-close-btn" data-action="close-modal">&times;</button>
                </div>
                <form id="transaction-form" class="form-container">
                    <div class="form-group">
                        <label>লেনদেনের ধরণ</label>
                        <select id="type" name="type">
                            <option value="cash_in" ${type === 'cash_in' ? 'selected' : ''}>ক্যাশ ইন</option>
                            <option value="cash_out" ${type === 'cash_out' ? 'selected' : ''}>ক্যাশ আউট</option>
                            <option value="online_in" ${type === 'online_in' ? 'selected' : ''}>অনলাইন ইন</option>
                            <option value="online_out" ${type === 'online_out' ? 'selected' : ''}>অনলাইন আউট</option>
                            <option value="exchange_online_to_cash" ${type === 'exchange_online_to_cash' ? 'selected' : ''}>এক্সচেঞ্জ (অনলাইন > ক্যাশ)</option>
                            <option value="due_add" ${type === 'due_add' ? 'selected' : ''}>বাকি দিলাম (Due Add)</option>
                            <option value="due_receive" ${type === 'due_receive' ? 'selected' : ''}>বাকি নিলাম (Due Receive)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="amount">টাকার পরিমাণ</label>
                        <input type="number" id="amount" placeholder="0.00" required>
                    </div>
                    <div class="form-group">
                        <label for="reason">কারণ/বিবরণ</label>
                        <input type="text" id="reason" placeholder="যেমন: পণ্য বিক্রয়" required>
                    </div>
                    <div class="form-group hidden" id="payment-method-group">
                        <label>পেমেন্ট মাধ্যম (বাকি আদায়ের জন্য)</label>
                        <select id="method">
                            <option value="cash">ক্যাশ</option>
                            <option value="online">অনলাইন</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="note">নোট (ঐচ্ছিক)</label>
                        <textarea id="note" rows="2"></textarea>
                    </div>
                    <button type="submit" class="btn" id="save-btn">সেভ করুন</button>
                </form>
            </div>
        `;
        modalContainer.classList.add('visible');
        updateFormFields(); // Call once to set initial state
    };
    
    const renderStartingBalanceForm = () => {
        modalContainer.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>শুরুর ব্যালেন্স সেট করুন</h2>
                </div>
                <form id="starting-balance-form" class="form-container">
                    <p>অ্যাপটি ব্যবহারের আগে আপনার বর্তমান ক্যাশ ও অনলাইন ব্যালেন্স দিন।</p>
                    <div class="form-group">
                        <label for="start-cash">হাতে ক্যাশ কত আছে?</label>
                        <input type="number" id="start-cash" placeholder="2000" required>
                    </div>
                    <div class="form-group">
                        <label for="start-online">অনলাইন একাউন্টে কত আছে?</label>
                        <input type="number" id="start-online" placeholder="5000" required>
                    </div>
                    <button type="submit" class="btn">শুরু করুন</button>
                </form>
            </div>
        `;
        modalContainer.classList.add('visible');
    };

    const renderReconciliationForm = () => {
        const stats = calculateStats(allTransactions);
        modalContainer.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>ক্যাশ মেলানো</h2>
                    <button class="modal-close-btn" data-action="close-modal">&times;</button>
                </div>
                <div class="form-container">
                    <p>সিস্টেম অনুযায়ী আপনার বর্তমান ক্যাশ ব্যালেন্স:</p>
                    <h3 style="text-align: center;">${formatCurrency(stats.cashBalance)}</h3>
                    <div class="form-group">
                        <label for="physical-cash">আপনার হাতে আসল ক্যাশ কত আছে?</label>
                        <input type="number" id="physical-cash" placeholder="গণনা করে লিখুন">
                    </div>
                    <div id="reconcile-result" style="text-align: center; font-weight: bold; margin-top: 1rem;"></div>
                </div>
            </div>
        `;
        modalContainer.classList.add('visible');
    };

    // =========================================================================
    // 🔄 DATA HANDLING & ROUTING
    // =========================================================================
    
    const fetchDataAndRender = async (page = 'dashboard') => {
        showLoader();
        try {
            const snapshot = await transactionsCollection.orderBy('timestamp', 'desc').get();
            allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const stats = calculateStats(allTransactions);

            if (page === 'dashboard') {
                renderDashboard(stats);
            } else if (page === 'transactions') {
                renderTransactionList(allTransactions);
            }
        } catch (error) {
            console.error("Error fetching data: ", error);
            mainContent.innerHTML = "<p>ডেটা লোড করা যায়নি। আপনার ইন্টারনেট সংযোগ পরীক্ষা করুন।</p>";
        }
    };
    
    const switchPage = (page) => {
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === page) {
                item.classList.add('active');
                appTitle.textContent = item.dataset.title;
            }
        });
        fetchDataAndRender(page);
    };

    const handleSaveTransaction = (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('save-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'সেভ হচ্ছে...';

        const newTransaction = {
            type: document.getElementById('type').value,
            amount: parseFloat(document.getElementById('amount').value),
            reason: document.getElementById('reason').value,
            note: document.getElementById('note').value,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if(newTransaction.type === 'due_receive'){
            newTransaction.method = document.getElementById('method').value;
        }

        transactionsCollection.add(newTransaction)
            .then(() => {
                hideModal();
                fetchDataAndRender(document.querySelector('.nav-item.active').dataset.page);
            })
            .catch(err => {
                console.error("Error adding transaction: ", err);
                alert('ত্রুটি! লেনদেন সেভ করা যায়নি।');
                saveBtn.disabled = false;
                saveBtn.textContent = 'সেভ করুন';
            });
    };

    const handleSaveStartingBalance = (e) => {
        e.preventDefault();
        const cashAmount = parseFloat(document.getElementById('start-cash').value) || 0;
        const onlineAmount = parseFloat(document.getElementById('start-online').value) || 0;

        const batch = db.batch();

        const cashTransaction = {
            type: 'starting_balance',
            method: 'cash',
            amount: cashAmount,
            reason: 'প্রারম্ভিক ক্যাশ ব্যালেন্স',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        const onlineTransaction = {
            type: 'starting_balance',
            method: 'online',
            amount: onlineAmount,
            reason: 'প্রারম্ভিক অনলাইন ব্যালেন্স',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (cashAmount > 0) {
            batch.set(transactionsCollection.doc(), cashTransaction);
        }
        if (onlineAmount > 0) {
            batch.set(transactionsCollection.doc(), onlineTransaction);
        }
        
        batch.commit().then(() => {
            localStorage.setItem('startingBalanceSet', 'true');
            hideModal();
            fetchDataAndRender();
        }).catch(err => console.error("Error setting starting balance", err));
    };

    const updateFormFields = () => {
        const typeSelector = document.getElementById('type');
        if (!typeSelector) return;
        const selectedType = typeSelector.value;
        const paymentMethodGroup = document.getElementById('payment-method-group');
        paymentMethodGroup.classList.toggle('hidden', selectedType !== 'due_receive');
    };
    
    const handleReconciliation = (e) => {
        if(e.target.id !== 'physical-cash') return;
        
        const physicalCash = parseFloat(e.target.value) || 0;
        const stats = calculateStats(allTransactions);
        const systemCash = stats.cashBalance;
        const difference = physicalCash - systemCash;
        const resultDiv = document.getElementById('reconcile-result');
        
        if (difference === 0) {
            resultDiv.textContent = 'সঠিকভাবে মিলেছে!';
            resultDiv.style.color = 'var(--green)';
        } else {
            resultDiv.textContent = `পার্থক্য: ${formatCurrency(difference)}`;
            resultDiv.style.color = difference > 0 ? 'var(--green)' : 'var(--red)';
        }
    };

    // =========================================================================
    // ⚡️ EVENT LISTENERS & INITIALIZATION
    // =========================================================================
    
    document.body.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        const pageTarget = e.target.closest('[data-page]');

        if (pageTarget) {
            switchPage(pageTarget.dataset.page);
        }
        if (actionTarget) {
            const { action, type } = actionTarget.dataset;
            if (action === 'add-transaction') renderTransactionForm(type);
            if (action === 'close-modal') hideModal();
            if (action === 'reconcile') renderReconciliationForm();
        }
    });

    modalContainer.addEventListener('submit', (e) => {
        if (e.target.id === 'transaction-form') handleSaveTransaction(e);
        if (e.target.id === 'starting-balance-form') handleSaveStartingBalance(e);
    });
    
    modalContainer.addEventListener('change', (e) => {
        if (e.target.id === 'type') updateFormFields();
    });
    
    modalContainer.addEventListener('input', (e) => {
        if (e.target.id === 'physical-cash') handleReconciliation(e);
    });

    // Initial Load
    window.addEventListener('load', () => {
        // Service Worker Registration
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registered.', reg))
                .catch(err => console.error('Service Worker registration failed: ', err));
        }
        
        // Check if starting balance is set
        if (!localStorage.getItem('startingBalanceSet')) {
            renderStartingBalanceFo
