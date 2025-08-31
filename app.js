document.addEventListener('DOMContentLoaded', () => {

    // =========================================================================
    // 🔥 START: FIREBASE CONFIGURATION
    // =========================================================================
    // TODO: আপনার Firebase প্রজেক্টের কনফিগারেশন এখানে পেস্ট করুন।
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
    db.enablePersistence().catch(err => console.error("Firestore persistence error: ", err));
    const transactionsCollection = db.collection('transactions');

    // DOM Elements
    const mainContent = document.getElementById('app-main-content');
    const appTitle = document.getElementById('app-title');
    const navItems = document.querySelectorAll('.nav-item');

    // Helper Functions
    const formatCurrency = (amount) => `৳ ${amount.toLocaleString('en-IN')}`;
    const formatDate = (timestamp) => {
        if (!timestamp) return '...';
        return new Date(timestamp.seconds * 1000).toLocaleString('bn-BD', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    // =========================================================================
    // 🎨 TEMPLATES / VIEWS
    // =========================================================================

    const showLoader = () => {
        mainContent.innerHTML = `<div class="loader-container"><div class="loader"></div></div>`;
    };
    
    const dashboardView = (stats) => `
        <div class="dashboard-grid">
            <div class="stat-card"><h3>ক্যাশ ব্যালেন্স</h3><p class="amount">${formatCurrency(stats.cashBalance)}</p></div>
            <div class="stat-card"><h3>অনলাইন ব্যালেন্স</h3><p class="amount">${formatCurrency(stats.onlineBalance)}</p></div>
            <div class="stat-card"><h3>আজকের ক্যাশ ইন</h3><p class="amount positive">${formatCurrency(stats.today.cashIn)}</p></div>
            <div class="stat-card"><h3>আজকের ক্যাশ আউট</h3><p class="amount negative">${formatCurrency(stats.today.cashOut)}</p></div>
            <div class="stat-card"><h3>আজকের অনলাইন ইন</h3><p class="amount positive">${formatCurrency(stats.today.onlineIn)}</p></div>
            <div class="stat-card"><h3>আজকের অনলাইন আউট</h3><p class="amount negative">${formatCurrency(stats.today.onlineOut)}</p></div>
            <div class="stat-card"><h3>মোট বকেয়া (Due)</h3><p class="amount total-due">${formatCurrency(0)}</p></div>
        </div>
    `;

    const addTransactionView = () => `
        <form id="transaction-form" class="form-container">
            <div class="form-group">
                <label>লেনদেনের ধরণ</label>
                <div class="radio-group" id="type-selector">
                    <input type="radio" id="cash_in" name="type" value="cash_in" checked><label for="cash_in">ক্যাশ ইন</label>
                    <input type="radio" id="cash_out" name="type" value="cash_out"><label for="cash_out">ক্যাশ আউট</label>
                    <input type="radio" id="online_in" name="type" value="online_in"><label for="online_in">অনলাইন ইন</label>
                    <input type="radio" id="online_out" name="type" value="online_out"><label for="online_out">অনলাইন আউট</label>
                </div>
            </div>
            <div class="form-group">
                <label for="amount">টাকার পরিমাণ</label>
                <input type="number" id="amount" placeholder="0.00" required>
            </div>
            <div class="form-group">
                <label for="reason">কারণ/বিবরণ</label>
                <input type="text" id="reason" placeholder="যেমন: পণ্য বিক্রয়" required>
            </div>
            <div class="form-group">
                <label for="note">নোট (ঐচ্ছিক)</label>
                <textarea id="note" rows="3"></textarea>
            </div>
            <button type="submit" class="btn" id="save-btn">সেভ করুন</button>
        </form>
    `;

    const transactionListView = (transactions) => {
        if (transactions.length === 0) {
            return `<p style="text-align:center;">এখনো কোনো লেনদেন হয়নি।</p>`;
        }
        return `
            <div class="transaction-list">
                ${transactions.map(tx => {
                    const typeMap = {
                        cash_in: { class: 'in', icon: 'CI', label: 'ক্যাশ ইন' },
                        cash_out: { class: 'out', icon: 'CO', label: 'ক্যাশ আউট' },
                        online_in: { class: 'in', icon: 'OI', label: 'অনলাইন ইন' },
                        online_out: { class: 'out', icon: 'O', label: 'অনলাইন আউট' }
                    };
                    const info = typeMap[tx.type];
                    return `
                        <div class="transaction-item">
                            <div class="transaction-icon ${info.class}">${info.icon}</div>
                            <div class="transaction-details">
                                <p class="transaction-reason">${tx.reason}</p>
                                <p class="transaction-meta">${info.label} • ${formatDate(tx.timestamp)}</p>
                            </div>
                            <p class="transaction-amount ${info.class}">${info.class === 'in' ? '+' : '-'}${formatCurrency(tx.amount)}</p>
                        </div>
                    `
                }).join('')}
            </div>
        `;
    };

    // =========================================================================
    // ⚙️ APP LOGIC & ROUTING
    // =========================================================================
    
    const calculateStats = (transactions) => {
        const stats = {
            cashBalance: 0,
            onlineBalance: 0,
            today: { cashIn: 0, cashOut: 0, onlineIn: 0, onlineOut: 0 }
        };
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        transactions.forEach(tx => {
            const txDate = tx.timestamp ? new Date(tx.timestamp.seconds * 1000) : new Date();
            
            switch(tx.type) {
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
            }
        });
        return stats;
    };

    const renderDashboard = () => {
        showLoader();
        transactionsCollection.orderBy('timestamp', 'desc').get().then(snapshot => {
            const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const stats = calculateStats(transactions);
            mainContent.innerHTML = dashboardView(stats);
        });
    };

    const renderAddTransaction = () => {
        mainContent.innerHTML = addTransactionView();
        const form = document.getElementById('transaction-form');
        const saveBtn = document.getElementById('save-btn');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            saveBtn.disabled = true;
            saveBtn.textContent = 'সেভ হচ্ছে...';

            const newTransaction = {
                type: form.querySelector('input[name="type"]:checked').value,
                amount: parseFloat(document.getElementById('amount').value),
                reason: document.getElementById('reason').value,
                note: document.getElementById('note').value,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };

            transactionsCollection.add(newTransaction)
                .then(() => {
                    alert('লেনদেন সফলভাবে সেভ হয়েছে!');
                    window.location.hash = '#dashboard';
                })
                .catch(err => {
                    console.error("Error adding transaction: ", err);
                    alert('ত্রুটি! লেনদেন সেভ করা যায়নি।');
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'সেভ করুন';
                });
        });
    };
    
    const renderTransactionList = () => {
        showLoader();
        transactionsCollection.orderBy('timestamp', 'desc').limit(50).get().then(snapshot => {
            const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            mainContent.innerHTML = transactionListView(transactions);
        });
    };

    const routes = {
        '#dashboard': renderDashboard,
        '#add': renderAddTransaction,
        '#transactions': renderTransactionList,
    };

    const router = () => {
        const hash = window.location.hash || '#dashboard';
        const routeHandler = routes[hash];
        if (routeHandler) {
            routeHandler();
            updateActiveNav(hash);
        } else {
            routes['#dashboard'](); // Default route
            updateActiveNav('#dashboard');
        }
    };
    
    const updateActiveNav = (hash) => {
        const activeHash = (hash === '#add') ? '#dashboard' : hash; // Add button does not have active state
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('href') === activeHash) {
                item.classList.add('active');
                appTitle.textContent = item.dataset.title;
            }
        });
    };

    // Initial Load & Event Listeners
    window.addEventListener('hashchange', router);
    window.addEventListener('load', () => {
        router();
        // Service Worker Registration
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registered.', reg))
                .catch(err => console.error('Service Worker registration failed: ', err));
        }
    });

});
