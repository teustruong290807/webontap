/* ==========================================================================
   HỆ THỐNG LUYỆN THI CÁ NHÂN (BẢN V9 - VIDEO YOUTUBE & UI TỐI ƯU)
========================================================================== */

var defaultData = {
    "Toán": [], "Tiếng Anh": [], "Công nghệ": [], "Sinh học": [], "Vocabulary": [], "Documents": {}
};

// ĐÃ ĐỔI TẤT CẢ THÀNH VAR ĐỂ CỨU IPHONE KHỎI LỖI TRẮNG TRANG
var localData = null;
try {
    localData = JSON.parse(localStorage.getItem('myStudyData'));
} catch (e) {
    console.log("Lỗi chặn LocalStorage trên iPhone");
}
var db = (localData && Object.keys(localData).length > 0) ? localData : defaultData;
if (!db.Vocabulary) db.Vocabulary = [];
if (!db.Documents) db.Documents = {};

var currentSubject = "";
var currentQuizIndex = -1;
var currentQuizQuestions = [];
var currentQuestionIndex = 0;
var editingQuizIndex = -1;

var sessionCorrectCount = 0;
var sessionResultList = []; 
var hasAnsweredCurrent = false;

var isTestMode = false;
var isIsolatedMode = false; // Khóa học sinh trong 1 bài duy nhất
var testAnswers = []; 
var clusterSelections = []; 
var focusedOptionBtn = null; 

var quizTimerInterval = null;
var remainingSeconds = 0;

var IMGBB_API_KEY = '1a44a672e09fd4613cac5a56ec4183ac'; 

// 👇 DÁN WEB APP URL MỚI CỦA BẢN CLONE VÀO ĐÂY 👇
var CLOUD_API_URL = 'https://script.google.com/macros/s/AKfycbzZL01CPGOgnSeSh2SnxJco8zVXBz2AqJnmkJdmd-DqBR-LRjZkN_ZeQnuiUWGW5QlCiQ/exec';

var userProgress = {};

function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        subject: params.get('subject'),
        quizIndex: params.get('quizIndex'),
        quizTitle: params.get('quizTitle')
    };
}

function cleanOpt(opt) {
    if (!opt) return "";
    
    // 1. Tìm chữ cái A, B, C, D (gom trọn nhóm kể cả khi bị dính dấu * ở đằng trước)
    // Ví dụ: Bắt được cả "A.", "*A.", " * B)"
    let prefixMatch = opt.match(/^[\*]?\s*([A-Za-z])[\.\:\-\)]\s*/);
    
    // 2. Gọt bỏ hoàn toàn phần mào đầu này
    let cleaned = opt.replace(/^[\*]?\s*[A-Za-z][\.\:\-\)]\s*/, '').trim();
    
    // 3. XỬ LÝ RIÊNG CHO PHIẾU TRẮC NGHIỆM
    if (cleaned.includes("bubble-opt") && prefixMatch) {
        let letter = prefixMatch[1].toUpperCase(); // Trích xuất đúng 1 chữ cái A, B, C hoặc D
        // Trả lại một cái nút tròn chứa duy nhất 1 chữ cái ở giữa
        return `<span class="bubble-opt" data-key="${letter}">${letter}</span>`;
    }
    
    // 4. Xử lý cho các đề dạng khác (Nếu lỡ còn dính dấu * thì gọt nốt)
    if (cleaned.startsWith('*')) {
        cleaned = cleaned.substring(1).trim();
    }
    
    return cleaned;
}

function formatText(text) {
    if (!text) return "";
    
    // 1. Tàng hình các công tắc bí mật của Giáo viên
    let result = text
        .replace(/\[CHÙM\]/gi, '') 
        .replace(/\[HẾT CHÙM\]/gi, '');
        
    // 2. Tự động in đậm riêng chữ "Câu X:", "Question X:", "Bài X:" ở đầu dòng
    result = result.replace(/^(Câu|Question|Bài)\s*\d+(?:\s*[\-\–\—]\s*\d+)?[\.\:\-]?/gim, '<b>$&</b>');
    
    // 3. Xử lý Ảnh, PDF, Audio và Xuống dòng
    result = result
        .replace(/\[IMG:\s*(https?:\/\/[^\]]+)\]/gi, '<br><img src="$1" style="max-width: 100%; border-radius: 8px; margin: 15px 0;"/><br>')
        // Dòng xử lý PDF mới thêm vào đây:
        .replace(/\[PDF:\s*(https?:\/\/[^\]]+)\]/gi, '<br><iframe src="$1" style="width: 100%; height: 75vh; border-radius: 12px; border: 1px solid var(--border-color); background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.05);" frameborder="0"></iframe><br>')
        .replace(/\[AUDIO:\s*(https?:\/\/[^\]]+)\]/gi, '<br><audio controls style="width: 100%; outline: none; border-radius: 8px; background-color: rgba(0,0,0,0.05); margin: 15px 0;"><source src="$1" type="audio/mpeg">Trình duyệt không hỗ trợ phát âm thanh.</audio><br>')
        .replace(/\n/g, '<br>');
        
    return result.trim();
}

// [MỚI] Hàm lấy link Embed Youtube
function getYoutubeEmbedUrl(url) {
    let match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}?rel=0` : null;
}

window.onload = function() { 
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('app-sidebar');
        if (sidebar) sidebar.classList.add('collapsed');
    }
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) themeBtn.classList.remove('hidden');

    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const introScreen = document.getElementById('app-intro');
    
    // 1. KIỂM TRA ĐƯỜNG LINK CÓ CHỨA BÀI TẬP HOẶC TỪ VỰNG KHÔNG?
    const params = new URLSearchParams(window.location.search);
    const hasQuizParams = params.has('subject') && (params.has('quizTitle') || params.has('quizIndex'));
    const hasVocabParams = params.has('vocabTopic'); // <-- ĐÃ BỔ SUNG CHÌA KHÓA NÀY

    // CHO PHÉP ĐI QUA NẾU: Đã đăng nhập HOẶC Có link làm bài/link từ vựng
    if (isLoggedIn === 'true' || hasQuizParams || hasVocabParams) {
        if (introScreen) introScreen.classList.add('hidden');
        const loginScreen = document.getElementById('screen-login');
        if (loginScreen) loginScreen.classList.add('hidden'); 
        
        const heroName = localStorage.getItem('studentName') || "Khách";
        const userNameDisplay = document.getElementById('display-user-name');
        if (userNameDisplay) userNameDisplay.innerText = heroName;

        // 2. ĐIỀU HƯỚNG CHÍNH XÁC VÀO TRANG CẦN THIẾT
        if (typeof CLOUD_API_URL !== 'undefined' && CLOUD_API_URL !== '') {
            document.getElementById('app-title').innerText = "Đang tải dữ liệu...";
            fetchCloudData().then(() => {
                fetchUserProgress();
                if (hasQuizParams) openQuizFromParams();
                else if (hasVocabParams) openVocabGameFromParams(); // <-- ĐẨY VÀO GAME TỪ VỰNG
                else goHome();
            });
        } else {
            if (hasQuizParams) setTimeout(() => openQuizFromParams(), 500);
            else if (hasVocabParams) setTimeout(() => openVocabGameFromParams(), 500); // <-- ĐẨY VÀO GAME TỪ VỰNG
            else goHome();
        }
    } else {
        if (introScreen) introScreen.classList.add('hidden'); 
        showScreen('screen-login'); 
    }
};

function switchAuthTab(tab) {
    document.getElementById('tab-login').classList.remove('active');
    document.getElementById('tab-register').classList.remove('active');
    document.getElementById('form-login').classList.add('hidden');
    document.getElementById('form-register').classList.add('hidden');
    
    if (tab === 'login') {
        document.getElementById('tab-login').classList.add('active');
        document.getElementById('form-login').classList.remove('hidden');
    } else {
        document.getElementById('tab-register').classList.add('active');
        document.getElementById('form-register').classList.remove('hidden');
    }
}

async function handleLogin() {
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    const btn = document.getElementById('btn-do-login');

    if (!user || !pass) { alert("Vui lòng nhập đủ Tên đăng nhập và Mật khẩu!"); return; }
    
    if (pass === "lopvip" && user === "admin") {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('studentName', 'Giáo Viên');
        localStorage.setItem('studentClass', 'Admin');
        
        // [MỚI]: LƯU THÊM USERNAME CHO ADMIN ĐỂ DÙNG BOOKMARK
        localStorage.setItem('currentLoggedInUser', 'admin'); 
        await fetchUserBookmarks('admin'); 
        
        window.location.reload();
        return;
    }

    btn.innerText = "Đang kiểm tra... ⏳"; btn.disabled = true;
    try {
        const response = await fetch(CLOUD_API_URL, {
            method: 'POST',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: 'login', username: user, password: pass })
        });
        const result = await response.text();
        
        if (result === "User_Not_Found") alert("❌ Tên đăng nhập không tồn tại!");
        else if (result === "Wrong_Password") alert("❌ Sai mật khẩu!");
        else if (result === "Account_Pending") alert("⏳ Tài khoản của em đang chờ Giáo viên duyệt. Vui lòng quay lại sau nhé!");
        else {
            try {
                const userInfo = JSON.parse(result);
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('studentName', userInfo.name);
                localStorage.setItem('studentClass', userInfo.className);
                
                // [MỚI]: LƯU THÊM USERNAME ĐỂ HỆ THỐNG BIẾT AI ĐANG LƯU CÂU HỎI
                localStorage.setItem('currentLoggedInUser', user);
                
                alert(`✅ Đăng nhập thành công! Chào mừng ${userInfo.name}. Đang đồng bộ dữ liệu...`);
                
                // [MỚI]: ÉP WEB PHẢI TẢI XONG BOOKMARK RỒI MỚI ĐƯỢC RELOAD TRANG
                await fetchUserBookmarks(user);
                
                window.location.reload();
            } catch(e) {
                alert("❌ Lỗi phản hồi từ máy chủ!");
            }
        }
    } catch (error) { alert("❌ Lỗi kết nối máy chủ! Vui lòng thử lại."); }
    btn.innerText = "Đăng Nhập 🚀"; btn.disabled = false;
}

function logout() {
    if(confirm("Bạn có chắc chắn muốn đăng xuất?")) {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('studentName');
        localStorage.removeItem('studentClass');
        window.location.reload();
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed');
}

function showScreen(screenId) {
    // 1. Ẩn tất cả các màn hình
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    
    // 2. Hiện màn hình được yêu cầu
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) targetScreen.classList.remove('hidden');

    // 3. Ẩn/hiện khung Dashboard tùy theo việc có đang ở màn hình Đăng nhập hay không
    const dashboard = document.getElementById('app-dashboard');
    if (screenId === 'screen-login') {
        if (dashboard) dashboard.classList.add('hidden');
    } else {
        if (dashboard) dashboard.classList.remove('hidden');
    }

    // 4. Bật hiệu ứng sáng (active) cho nút Menu đang được chọn
    document.querySelectorAll('.sidebar-btn').forEach(btn => btn.classList.remove('active'));
    if (screenId === 'screen-home') document.querySelector('button[onclick="goHome()"]')?.classList.add('active');
    else if (screenId === 'screen-document') document.querySelector('button[onclick="openDocManage()"]')?.classList.add('active');
    else if (screenId === 'screen-vocab-manage') document.querySelector('button[onclick="openVocabManage()"]')?.classList.add('active');
    else if (screenId === 'screen-vocab-game') document.querySelector('button[onclick="openVocabGame()"]')?.classList.add('active');

    // 5. [MỚI THÊM] - Tự động đóng Sidebar trên Mobile sau khi chuyển trang
    if (window.innerWidth <= 768) {
        document.getElementById('app-sidebar')?.classList.add('collapsed');
    }
   // [MỚI] 6. DỌN DẸP THANH GHIM KHI THOÁT MÀN HÌNH BÀI LÀM
    if (typeof syncStickyActionBar === 'function') syncStickyActionBar();
}

function goHome() {
    // 1. [NÂNG CẤP]: Quét và ẨN TẤT CẢ các màn hình (kể cả những màn hình mới thêm sau này)
    document.querySelectorAll('.screen').forEach(function(screen) { 
        screen.classList.add('hidden'); 
    });
    
    // 2. Chỉ HIỆN DUY NHẤT màn hình Trang chủ
    const homeScreen = document.getElementById('screen-home');
    if (homeScreen) homeScreen.classList.remove('hidden');

    const appTitle = document.getElementById('app-title');
    if (appTitle) appTitle.innerText = "Trang chủ Môn học";
    
    const grid = document.getElementById('subject-list');
    if (grid) grid.innerHTML = "";
    
    let subjectCount = 0;
    let quizCount = 0;
    
    // 3. Vòng lặp render môn học của em (GIỮ NGUYÊN)
    for (const subject in db) {
        // Bỏ qua các mục hệ thống ngầm
        if (subject === "Vocabulary" || subject === "Documents" || subject === "TopicPasswords" || subject === "FocusMusic") continue;

        // 🔒 Lính gác bảo vệ dữ liệu:
        if (!Array.isArray(db[subject])) {
            console.warn(`⚠️ Dữ liệu môn "${subject}" không đúng định dạng, bỏ qua.`);
            continue; 
        }

        subjectCount++;
        quizCount += db[subject].length; // Đếm tổng số đề thi
        
        const div = document.createElement('div');
        div.className = 'subject-card';
        
        let totalRealQuestions = 0;
        db[subject].forEach(quiz => {
            quiz.questions.forEach(q => {
                if (q.type === 'reading-cluster') totalRealQuestions += q.questions.length;
                else totalRealQuestions += 1;
            });
        });

        div.innerHTML = `
            <div>${subject}</div>
            <div style="font-size: 14px; color: var(--text-muted); margin-top: 10px; font-weight: normal;">
                ${db[subject].length} đề thi
            </div>
            <button class="delete-subject-btn teacher-only" title="Xóa môn học này" onclick="deleteSubject('${subject}', event)">
                <i class="ph-duotone ph-trash"></i>
            </button>
        `;
        div.onclick = (e) => { if (!e.target.closest('.delete-subject-btn')) openSubject(subject); };
        if (grid) grid.appendChild(div);
    }
    
    // 4. Cập nhật thống kê lên Banner (GIỮ NGUYÊN)
    const elSubCount = document.getElementById('total-subjects-count');
    const elQuizCount = document.getElementById('total-quizzes-count');
    if(elSubCount) elSubCount.innerText = subjectCount;
    if(elQuizCount) elQuizCount.innerText = quizCount;
    
    // 5. Lời chào theo thời gian thực (GIỮ NGUYÊN)
    const hour = new Date().getHours();
    let greeting = "Chào buổi sáng";
    if (hour >= 12 && hour < 18) greeting = "Chào buổi chiều";
    else if (hour >= 18) greeting = "Chào buổi tối";
    
    const name = localStorage.getItem('studentName') || "bạn";
    const elGreeting = document.getElementById('welcome-greeting');
    if(elGreeting) elGreeting.innerText = `${greeting}, ${name}! 👋`;

    // Đặt lại trạng thái nếu học sinh đang làm bài dở
    isTestMode = false; 
}

function deleteSubject(subjectName, event) {
    event.stopPropagation();
    if (confirm(`⚠️ CẢNH BÁO: Bạn có chắc chắn muốn xóa môn "${subjectName}" không?\n\nToàn bộ đề thi bên trong môn này sẽ bị xóa sạch và KHÔNG THỂ khôi phục!`)) {
        delete db[subjectName]; localStorage.setItem('myStudyData', JSON.stringify(db)); goHome(); 
        alert(`✅ Đã xóa môn ${subjectName} thành công!`);
    }
}

function addNewSubject() {
    const newSubject = prompt("Nhập tên lĩnh vực/môn học mới:");
    if (newSubject && newSubject.trim() !== "") {
        const subjectName = newSubject.trim();
        if (!db[subjectName]) { db[subjectName] = []; localStorage.setItem('myStudyData', JSON.stringify(db)); goHome(); } 
        else { alert("Lĩnh vực này đã tồn tại trên hệ thống!"); }
    }
}

let draggedQuizIndex = -1;
function handleQuizDragStart(e, index) { draggedQuizIndex = index; e.dataTransfer.effectAllowed = "move"; setTimeout(() => e.target.classList.add('dragging'), 0); }
function handleQuizDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
function handleQuizDrop(e, targetIndex) {
    e.preventDefault(); if (draggedQuizIndex === targetIndex || draggedQuizIndex === -1) return;
    const movedItem = db[currentSubject].splice(draggedQuizIndex, 1)[0];
    db[currentSubject].splice(targetIndex, 0, movedItem); localStorage.setItem('myStudyData', JSON.stringify(db)); 
    renderQuizListWithFilters(); 
}
function handleQuizDragEnd(e) { e.target.classList.remove('dragging'); draggedQuizIndex = -1; }

function addFilterToolbar() {
    let toolbar = document.getElementById('quiz-filter-toolbar');
    if (toolbar) return;
    const subjectScreen = document.getElementById('screen-subject');
    const listDiv = document.getElementById('quiz-list');
    toolbar = document.createElement('div');
    toolbar.id = 'quiz-filter-toolbar';
    toolbar.style.cssText = 'display: flex; gap: 12px; margin-bottom: 20px; align-items: center; flex-wrap: wrap; background: var(--card-bg); padding: 15px; border-radius: var(--radius-lg); border: 1px solid var(--border-color);';
    toolbar.innerHTML = `
        <span style="font-size:14px; font-weight: bold;">Sắp xếp:</span>
        <select id="sort-select" style="margin-bottom:0; width: auto; padding: 10px 40px 10px 15px;">
            <option value="default">Mặc định</option>
            <option value="az">Tên A-Z</option>
            <option value="za">Tên Z-A</option>
        </select>
        <span style="font-size:14px; margin-left:15px; font-weight: bold;">Lọc:</span>
        <select id="filter-select" style="margin-bottom:0; width: auto; padding: 10px 40px 10px 15px;">
            <option value="all">Tất cả</option>
            <option value="completed">Đã làm</option>
            <option value="notcompleted">Chưa làm</option>
        </select>
    `;
    subjectScreen.insertBefore(toolbar, listDiv);
    document.getElementById('sort-select').addEventListener('change', () => renderQuizListWithFilters());
    document.getElementById('filter-select').addEventListener('change', () => renderQuizListWithFilters());
}

function renderQuizListWithFilters() {
    const sortValue = document.getElementById('sort-select')?.value || 'default';
    const filterValue = document.getElementById('filter-select')?.value || 'all';
    let quizzes = [...db[currentSubject]];
    
    if (filterValue === 'completed') {
        quizzes = quizzes.filter(quiz => {
            const key = `${currentSubject}|${quiz.title}`;
            return userProgress[key] && userProgress[key].completed === true;
        });
    } else if (filterValue === 'notcompleted') {
        quizzes = quizzes.filter(quiz => {
            const key = `${currentSubject}|${quiz.title}`;
            return !userProgress[key] || userProgress[key].completed !== true;
        });
    }
    
    if (sortValue === 'az') {
        quizzes.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortValue === 'za') {
        quizzes.sort((a, b) => b.title.localeCompare(a.title));
    }
    
    const list = document.getElementById('quiz-list');
    list.innerHTML = "";
    if (quizzes.length === 0) {
        list.innerHTML = "<p style='text-align:center; color: var(--text-muted);'>Không có bài tập nào phù hợp.</p>";
        return;
    }
    quizzes.forEach(quiz => {
        const originalIndex = db[currentSubject].findIndex(q => q === quiz);
        const div = document.createElement('div');
        div.className = 'quiz-item drag-item'; div.draggable = true;
        div.ondragstart = (e) => handleQuizDragStart(e, originalIndex);
        div.ondragover = (e) => handleQuizDragOver(e);
        div.ondrop = (e) => handleQuizDrop(e, originalIndex);
        div.ondragend = (e) => handleQuizDragEnd(e);
        
        let progressLabel = "";
        if (quiz.progress) {
            let modeName = quiz.progress.isTestMode ? "Đang Kiểm tra dở" : "Đang Luyện tập dở";
            let modeColor = quiz.progress.isTestMode ? "var(--danger)" : "var(--primary)";
            progressLabel = `<span style="background:${modeColor}; color:#fff; padding:2px 8px; border-radius:6px; font-size:11px; margin-left:10px; font-weight:bold;">${modeName}</span>`;
        }
        let ytLabel = quiz.youtubeLink ? `<span style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid #ef4444; padding:2px 8px; border-radius:6px; font-size:11px; margin-left:10px; font-weight:bold;"><i class="ph-fill ph-youtube-logo"></i> Có Video</span>` : "";
        
        let totalSteps = quiz.questions.length;
        let totalRealQuestions = 0;
        quiz.questions.forEach(q => { if (q.type === 'reading-cluster') totalRealQuestions += q.questions.length; else totalRealQuestions += 1; });
        let timeLabel = quiz.timeLimit ? ` - ⏳ ${quiz.timeLimit} phút` : "";
        
        const key = `${currentSubject}|${quiz.title}`;
        const done = userProgress[key] && userProgress[key].completed;
        const doneBadge = done ? '<span style="background: var(--success); color: white; padding: 2px 8px; border-radius: 6px; font-size: 11px; margin-left: 10px; font-weight: bold;"><i class="ph-bold ph-check"></i> Đã làm</span>' : '';
        
        div.innerHTML = `
            <div class="quiz-title">
                <span style="cursor:grab; margin-right:15px; color:var(--text-muted); font-size:20px;" title="Kéo thả để sắp xếp">☰</span>
                ${quiz.title} ${progressLabel} ${doneBadge} ${ytLabel}
                <span style="font-size: 13px; color: var(--text-muted); font-weight: normal; margin-left: 5px;">(${totalRealQuestions} câu / ${totalSteps} chặng${timeLabel})</span>
            </div>
           <div class="action-group">
                <button class="btn btn-primary btn-sm" onclick="startQuiz(${originalIndex}, false)">Luyện tập</button>
                <button class="btn btn-sm" style="background:transparent; color:var(--primary); border:1px solid var(--primary);" onclick="startQuiz(${originalIndex}, true)">Kiểm tra</button>
                <button class="btn btn-sm teacher-only" style="background:#8b5cf6; color:#fff; border:none;" onclick="startTeachMode(${originalIndex})">👩‍🏫 Giảng</button>
                
                <button class="btn btn-edit btn-sm" onclick="editQuiz(${originalIndex})">Sửa</button>
                <button class="btn btn-danger btn-sm" onclick="deleteQuiz(${originalIndex})">Xóa</button>
                <button class="btn btn-sm" style="background:transparent; border:1px solid var(--border-color);" onclick="showQRCode('${currentSubject}', ${originalIndex})" title="Chia sẻ QR">
            <i class="ph-bold ph-qr-code"></i>
        </button> 
            </div>
        `;
        list.appendChild(div);
    });
}

function openSubject(subject) {
    currentSubject = subject;
    document.getElementById('current-subject-name').innerText = subject;
    document.getElementById('app-title').innerText = "Thư Mục: " + subject;
    addFilterToolbar();
    renderQuizListWithFilters();
    showScreen('screen-subject');
}

function goBackToSubject() { openSubject(currentSubject); }
function openInputScreen() {
    editingQuizIndex = -1;
    document.getElementById('quiz-title-input').value = "";
    if(document.getElementById('quiz-time-limit')) document.getElementById('quiz-time-limit').value = "";
    document.getElementById('quiz-youtube-link').value = ""; // [MỚI] Clear Link
    document.getElementById('raw-text').value = "";
    document.querySelector('#screen-input h2').innerText = "Tạo bài luyện tập mới";
    showScreen('screen-input');
}

/* ==========================================
   3. BỘ ĐỌC ĐỀ (PARSER)
========================================== */
function parseTextToJSON(text) {
    const parsed = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l !== "");

    let currentContext = [];
    let currentQuestion = null;

    function finalizeQuestion() {
        if (!currentQuestion) return;
        let mainContent = currentQuestion.content.join('\n');
        let qObj = null;

        if (currentQuestion.type === "writing") {
            qObj = { type: "writing", content: mainContent, explanation: currentQuestion.explanation };
        }
        else if (currentQuestion.type === "short-answer") { 
            qObj = { type: "short-answer", content: mainContent, correctAnswer: currentQuestion.shortAnswer, explanation: currentQuestion.explanation }; 
        }
        else if (currentQuestion.isTrueFalse && currentQuestion.options.length > 0) {
            let statements = [];
            currentQuestion.options.forEach((optLine) => {
                let isCorrect = optLine.startsWith('*');
                let cleanStatement = cleanOpt(optLine);
                statements.push({ text: cleanStatement, correctAnswer: isCorrect ? "Đúng" : "Sai" });
            });
            qObj = { type: "cluster-tf", content: mainContent, statements: statements, explanation: currentQuestion.explanation };
        }
        else if (currentQuestion.options.length >= 2) {
            const finalOptions = []; 
            let correctAns = "";
            currentQuestion.options.forEach(line => {
                finalOptions.push(line); 
                if (line.startsWith('*')) { correctAns = line; }
            });
            if (correctAns !== "") { 
                qObj = { type: "normal", content: mainContent, options: finalOptions, correctAnswer: correctAns, explanation: currentQuestion.explanation }; 
            }
        }
        
        if (qObj) { 
            qObj.context = currentContext.length > 0 ? currentContext.join('\n') : null; 
            parsed.push(qObj); 
        }
        currentQuestion = null;
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        if (line.toLowerCase().includes("thí sinh chọn đúng hoặc sai") || line.toLowerCase() === "questions") continue;

        // 1. [ĐÃ THÊM]: CÔNG TẮC NGẮT CHÙM
        if (/^\[HẾT CHÙM\]/i.test(line)) {
            finalizeQuestion();
            currentContext = []; // Xóa trắng ngữ liệu cũ, ép các câu sau thành câu đơn lẻ
            continue;
        }

        // 2. [ĐÃ SỬA]: THÊM TỪ KHÓA [CHÙM] ĐỂ HỆ THỐNG NHẬN DIỆN LÀ ĐOẠN VĂN CHUNG
        let isNewSection = (/^(?:read|mark|choose|indicate|complete|listen|đọc|chọn|đánh dấu).*(?:letter|option|passage|blank|question|câu)/i.test(line) && line.length > 25) || /^\[CHÙM\]/i.test(line);

        if (isNewSection) {
            finalizeQuestion();
            currentContext = [line]; 
            continue;
        }

        if (/^(?:Câu|Bài|Question)\s*\d+(?:\s*\([^\)]+\))?[\.\:]/i.test(line)) {
            finalizeQuestion();
            currentQuestion = { content: [line], options: [], isTrueFalse: false, type: "normal", explanation: "", isParsingExp: false };
        }
        else if (/^\[WRITING\]/i.test(line)) {
            if (currentQuestion) { currentQuestion.type = "writing"; }
        }
        else if (/^\*?\s*(?:\[ĐÁP ÁN\]|Đáp án|KQ)[\:\s]+(.+)/i.test(line)) {
            if (currentQuestion) { 
                const match = line.match(/^\*?\s*(?:\[ĐÁP ÁN\]|Đáp án|KQ)[\:\s]+(.+)/i); 
                currentQuestion.shortAnswer = match[1].trim(); 
                currentQuestion.type = "short-answer"; 
            }
        }
        else if (/^(\*)?(<u><b>|<b><u>)?[A-D][\.\)]/i.test(line)) {
            if (currentQuestion) { 
                currentQuestion.options.push(line); 
                currentQuestion.isParsingExp = false;
                if (/^(\*)?(<u><b>|<b><u>)?[a-d][\.\)]/.test(line)) { currentQuestion.isTrueFalse = true; } 
            }
        }
        else if (/^(?:\[Giải thích\]|Giải thích|HDG|Hướng dẫn giải|Tạm dịch)[\:\s]*(.*)/i.test(line)) {
            if (currentQuestion) {
                const match = line.match(/^(?:\[Giải thích\]|Giải thích|HDG|Hướng dẫn giải|Tạm dịch)[\:\s]*(.*)/i);
                currentQuestion.explanation = match[1] ? match[1].trim() : "";
                currentQuestion.isParsingExp = true;
            }
        }
        else {
            if (currentQuestion && currentQuestion.isParsingExp) {
                currentQuestion.explanation += (currentQuestion.explanation ? "<br>" : "") + line;
            }
            else if (currentQuestion && currentQuestion.options.length === 0 && currentQuestion.type !== "writing") { 
                currentQuestion.content.push(line); 
            } 
            else if (currentQuestion && currentQuestion.options.length > 0) { 
                currentQuestion.explanation += (currentQuestion.explanation ? "<br>" : "") + line;
            } 
            else { 
                currentContext.push(line); 
            }
        }
    }
    finalizeQuestion();

    const groupedParsed = []; 
    let currentGroup = null;

    for (let i = 0; i < parsed.length; i++) {
        let q = parsed[i];
        if (q.context) {
            let ctxStr = q.context; let transStr = "";
            let transMatch = ctxStr.match(/(?:\[Bản dịch\]|Bản dịch|Dịch nghĩa|\[Dịch\])[\:\s]*([\s\S]*)/i);
            if (transMatch) { transStr = transMatch[1].trim(); ctxStr = ctxStr.replace(transMatch[0], '').trim(); }

            // 3. [ĐÃ SỬA]: ÉP HỆ THỐNG PHẢI GOM NHÓM KHI THẤY TỪ KHÓA [CHÙM]
            let shouldCluster = (q.type === "normal" || q.type === "writing") && ctxStr && (ctxStr.split('\n').length > 2 || ctxStr.toLowerCase().includes('<b>') || ctxStr.toLowerCase().includes('[audio:') || transStr !== "" || ctxStr.toLowerCase().includes('[chùm]'));

            if (shouldCluster) {
                if (!currentGroup || currentGroup.context !== ctxStr) {
                    if (currentGroup) {
                        if (currentGroup.questions.length === 1 && !currentGroup.translation) { 
                            let sq = currentGroup.questions[0]; 
                            sq.content = `<div class="quiz-instruction">${currentGroup.context}</div>\n${sq.content}`; 
                            groupedParsed.push(sq); 
                        } 
                        else { groupedParsed.push(currentGroup); }
                    }
                    currentGroup = { type: "reading-cluster", context: ctxStr, translation: transStr, questions: [q] };
                } else { currentGroup.questions.push(q); }
            } else {
                if (currentGroup) {
                    if (currentGroup.questions.length === 1 && !currentGroup.translation) { 
                        let sq = currentGroup.questions[0]; 
                        sq.content = `<div class="quiz-instruction">${currentGroup.context}</div>\n${sq.content}`; 
                        groupedParsed.push(sq); 
                    } 
                    else { groupedParsed.push(currentGroup); } 
                    currentGroup = null;
                }
                if (ctxStr) q.content = `<div class="quiz-instruction">${ctxStr}</div>\n${q.content}`;
                groupedParsed.push(q);
            }
        } else {
            if (currentGroup) {
                if (currentGroup.questions.length === 1 && !currentGroup.translation) { 
                    let sq = currentGroup.questions[0]; 
                    sq.content = `<div class="quiz-instruction">${currentGroup.context}</div>\n${sq.content}`; 
                    groupedParsed.push(sq); 
                } 
                else { groupedParsed.push(currentGroup); } 
                currentGroup = null;
            }
            groupedParsed.push(q);
        }
    }
    if (currentGroup) {
        if (currentGroup.questions.length === 1 && !currentGroup.translation) { 
            let sq = currentGroup.questions[0]; 
            sq.content = `<div style="color:var(--primary); font-weight:bold; margin-bottom:10px;">${currentGroup.context}</div>\n${sq.content}`; 
            groupedParsed.push(sq); 
        } 
        else { groupedParsed.push(currentGroup); }
    }
    return groupedParsed;}

    /* ==========================================
   4. QUẢN LÝ DỮ LIỆU
========================================== */
function saveNewQuiz() {
    const title = document.getElementById('quiz-title-input').value.trim();
    let timeLimit = 0;
    if (document.getElementById('quiz-time-limit')) timeLimit = parseInt(document.getElementById('quiz-time-limit').value) || 0;
    
    // [MỚI] Lưu Link Youtube
    const ytLink = document.getElementById('quiz-youtube-link').value.trim();
    
    let rawText = document.getElementById('raw-text').value;

    // ==========================================
    // BẮT ĐẦU ĐOẠN CODE TỰ ĐỘNG SINH CÂU HỎI
    // ==========================================
    rawText = rawText.replace(/\[FAST-KEYS:\s*(.+?)\]/gi, function(match, keys) {
        // Lọc bỏ mọi khoảng trắng, dấu phẩy, chỉ giữ lại a,b,c,d và viết hoa
        let cleanKeys = keys.replace(/[^a-dA-D]/gi, '').toUpperCase();
        let generatedText = "";
        
        for (let i = 0; i < cleanKeys.length; i++) {
            let ans = cleanKeys[i];
            generatedText += `Câu ${i + 1}:\n`;
            // Chèn thẻ <span class="bubble-opt"></span> để CSS bắt tín hiệu biến thành nút tròn
            ['A', 'B', 'C', 'D'].forEach(char => {
                generatedText += (char === ans ? '*' : '') + `${char}. <span class="bubble-opt"></span>\n`;
            });
        }
        return generatedText;
    });
    // ==========================================
    // KẾT THÚC ĐOẠN CODE TỰ ĐỘNG SINH CÂU HỎI
    // ==========================================
    
    if (!title) { alert("Vui lòng nhập tên bài tập!"); return; }
    const questions = parseTextToJSON(rawText);
    if (questions.length === 0) { alert("Lỗi định dạng đề thi!"); return; }
    
    const quizData = { title: title, timeLimit: timeLimit, youtubeLink: ytLink, rawText: rawText, questions: questions };
    if (editingQuizIndex === -1) { db[currentSubject].unshift(quizData); } 
    else { db[currentSubject][editingQuizIndex] = quizData; editingQuizIndex = -1; }
    
    localStorage.setItem('myStudyData', JSON.stringify(db)); 
    openSubject(currentSubject);
}

function editQuiz(index) { 
    const quiz = db[currentSubject][index]; editingQuizIndex = index; 
    document.getElementById('quiz-title-input').value = quiz.title; 
    if (document.getElementById('quiz-time-limit')) document.getElementById('quiz-time-limit').value = quiz.timeLimit || "";
    document.getElementById('quiz-youtube-link').value = quiz.youtubeLink || ""; // [MỚI] Load link cũ vào ô sửa
    document.getElementById('raw-text').value = quiz.rawText || ""; 
    showScreen('screen-input'); 
}

function deleteQuiz(index) { 
    if (confirm(`Chắc chắn muốn xóa đề này?`)) { 
        db[currentSubject].splice(index, 1); localStorage.setItem('myStudyData', JSON.stringify(db)); openSubject(currentSubject); 
    } 
}

function exportData() {
    const dataStr = JSON.stringify(db, null, 2); const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); 
    a.href = url; a.download = "DuLieuLuyenThi_Backup.json"; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedDb = JSON.parse(e.target.result);
            if (importedDb && typeof importedDb === 'object') {
                const userChoice = confirm("BẠN MUỐN NẠP DỮ LIỆU NHƯ THẾ NÀO?\n\n- Bấm [OK] để GỘP THÊM file mới.\n- Bấm [Cancel] để XÓA SẠCH dữ liệu cũ và GHI ĐÈ hoàn toàn.");
                if (userChoice) {
                    for (let subject in importedDb) {
                        if (!db[subject]) { db[subject] = importedDb[subject]; } 
                        else { db[subject] = db[subject].concat(importedDb[subject]); }
                    }
                    alert("✅ Đã GỘP THÊM dữ liệu thành công!");
                } else {
                    if (confirm("⚠️ CẢNH BÁO: Toàn bộ dữ liệu cũ sẽ bị xóa vĩnh viễn. Bạn chắc chắn muốn GHI ĐÈ?")) { db = importedDb; alert("✅ Đã GHI ĐÈ dữ liệu thành công!"); } else return;
                }
                localStorage.setItem('myStudyData', JSON.stringify(db)); goHome(); 
            }
        } catch (error) { alert("❌ Lỗi đọc file. Dữ liệu không hợp lệ!"); }
    };
    reader.readAsText(file); event.target.value = '';
}

/* ==========================================
   5. KHỞI TẠO BÀI LÀM & ĐẾM GIỜ
========================================== */
function startQuiz(quizIndex, isTest) {
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    isTestMode = isTest; const quiz = db[currentSubject][quizIndex];
    currentQuizQuestions = quiz.questions; currentQuizIndex = quizIndex;
    
    testAnswers = new Array(quiz.questions.length).fill(null);
    quiz.questions.forEach((q, i) => {
        if (q.type === 'cluster-tf') testAnswers[i] = new Array(q.statements.length).fill(null);
        else if (q.type === 'reading-cluster') testAnswers[i] = new Array(q.questions.length).fill(null);
    });

    if (quiz.progress && quiz.progress.isTestMode === isTestMode) {
        if (confirm(`Bạn đang ${isTestMode ? "KIỂM TRA" : "LUYỆN TẬP"} dở bài này đến chặng số ${quiz.progress.currentQuestionIndex + 1}.\n\n- Bấm [OK] để LÀM TIẾP.\n- Bấm [Cancel] để LÀM LẠI TỪ ĐẦU.`)) {
            currentQuestionIndex = quiz.progress.currentQuestionIndex;
            if (!isTestMode) { 
                sessionCorrectCount = quiz.progress.sessionCorrectCount; 
                sessionResultList = quiz.progress.sessionResultList || []; 
            } 
            else { testAnswers = quiz.progress.testAnswers || testAnswers; }
            remainingSeconds = quiz.progress.remainingSeconds !== undefined ? quiz.progress.remainingSeconds : (quiz.timeLimit ? quiz.timeLimit * 60 : 0);
        } else { resetProgress(quiz); remainingSeconds = quiz.timeLimit ? quiz.timeLimit * 60 : 0; }
    } else { resetProgress(quiz); remainingSeconds = quiz.timeLimit ? quiz.timeLimit * 60 : 0; }
    
    document.getElementById('practice-title').innerText = quiz.title + (isTestMode ? " [CHẾ ĐỘ KIỂM TRA]" : " [CHẾ ĐỘ LUYỆN TẬP]");
    showScreen('screen-practice'); 

    if (remainingSeconds > 0 && isTestMode) { startTimer(); } 
    else { if (document.getElementById('quiz-timer-display')) document.getElementById('quiz-timer-display').classList.add('hidden'); }
    
    renderQuestion();
}

function startTimer() {
    const timerDisplay = document.getElementById('quiz-timer-display'); 
    if(timerDisplay) timerDisplay.classList.remove('hidden'); updateTimerUI();
    quizTimerInterval = setInterval(() => {
        remainingSeconds--; updateTimerUI();
        if (remainingSeconds <= 0) { clearInterval(quizTimerInterval); alert("⏳ Đã hết thời gian làm bài! Hệ thống sẽ tự động nộp bài của bạn."); confirmSubmitTest(true); }
    }, 1000);
}

function updateTimerUI() {
    const timerDisplay = document.getElementById('quiz-timer-display'); if(!timerDisplay) return;
    if (remainingSeconds <= 0) { timerDisplay.innerText = "⏳ 00:00"; return; }
    const m = Math.floor(remainingSeconds / 60); const s = remainingSeconds % 60; timerDisplay.innerText = `⏳ ${m}:${s < 10 ? '0' : ''}${s}`;
    if (remainingSeconds <= 300) { timerDisplay.style.color = "var(--danger)"; } else { timerDisplay.style.color = "var(--primary)"; }
}

function resetProgress(quiz) { 
    currentQuestionIndex = 0; sessionCorrectCount = 0; sessionResultList = []; 
    delete quiz.progress; localStorage.setItem('myStudyData', JSON.stringify(db)); 
}

function exitQuiz() {
    // Hành động khóa cửa: Nếu đang ở chế độ Cách ly thì chặn đứng, không cho về Trang chủ
    const closeAction = () => {
        if (isIsolatedMode) {
            document.body.innerHTML = "<div style='display:flex; flex-direction:column; gap: 15px; height:100vh; align-items:center; justify-content:center; background:var(--bg-main); color:var(--primary); font-size:24px; font-weight:bold; text-align:center; padding: 20px;'>🎓<br>Dữ liệu đã được ghi nhận.<br>Em có thể đóng cửa sổ này!</div>";
        } else {
            openSubject(currentSubject);
        }
    };

    if (currentQuestionIndex > 0 || hasAnsweredCurrent || (isTestMode && testAnswers.some(a => a !== null))) {
        const overlay = document.createElement('div'); overlay.id = 'exit-modal-overlay'; overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(5px);";
        const box = document.createElement('div'); box.style.cssText = "background:var(--card-bg); padding:30px; border-radius:16px; border:1px solid var(--border-color); text-align:center; max-width:400px; width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.9);";
        box.innerHTML = `<h3 style="margin-top:0; color:var(--text-main); font-size:22px; font-weight: 500;">Thoát bài làm</h3><p style="color:var(--text-muted); margin-bottom:25px; line-height:1.5;">Bạn đang làm dở bài tập này. Bạn muốn lưu lại tiến trình để lần sau làm tiếp, hay xóa đi để làm lại từ đầu?</p><div style="display:flex; flex-direction:column; gap:12px;"><button id="btn-save-exit" class="btn btn-primary" style="width:100%; justify-content:center;">💾 Lưu tiến trình & Thoát</button><button id="btn-reset-exit" class="btn btn-danger" style="width:100%; justify-content:center;">🗑️ Xóa tiến trình & Thoát</button><button id="btn-cancel-exit" class="btn btn-secondary" style="width:100%; justify-content:center;">❌ Tiếp tục làm</button></div>`;
        overlay.appendChild(box); document.body.appendChild(overlay);

        document.getElementById('btn-save-exit').onclick = () => {
            if(quizTimerInterval) clearInterval(quizTimerInterval);
            db[currentSubject][currentQuizIndex].progress = {
                isTestMode: isTestMode, currentQuestionIndex: currentQuestionIndex,
                sessionCorrectCount: sessionCorrectCount, sessionResultList: sessionResultList, testAnswers: testAnswers, remainingSeconds: remainingSeconds
            };
            localStorage.setItem('myStudyData', JSON.stringify(db)); 
            document.body.removeChild(overlay); 
            closeAction(); // Gọi khóa cửa
        };
        
        document.getElementById('btn-reset-exit').onclick = () => {
            if(quizTimerInterval) clearInterval(quizTimerInterval);
            delete db[currentSubject][currentQuizIndex].progress;
            localStorage.setItem('myStudyData', JSON.stringify(db)); 
            document.body.removeChild(overlay); 
            closeAction(); // Gọi khóa cửa
        };
        document.getElementById('btn-cancel-exit').onclick = () => { document.body.removeChild(overlay); };
    } else {
        if(quizTimerInterval) clearInterval(quizTimerInterval);
        if (currentQuizIndex !== -1 && db[currentSubject][currentQuizIndex]) {
            delete db[currentSubject][currentQuizIndex].progress; localStorage.setItem('myStudyData', JSON.stringify(db));
        }
        closeAction(); // Gọi khóa cửa
    }
}

/* ==========================================
   6. HIỂN THỊ CÂU HỎI (ĐÃ TẮT TRỘN NGẦM & TÁCH YÊU CẦU ĐỀ)
========================================== */
function renderQuestion() {
    // Đã xóa bỏ tính năng "Tự động đảo phương án khi mở đề" để bảo toàn bản gốc khi In. 
    // Phương án chỉ bị đảo khi Giáo viên chủ động bấm nút "Trộn đề".

    if (!isTestMode && currentQuestionIndex >= currentQuizQuestions.length) { showResults(); return; }

    hasAnsweredCurrent = false; focusedOptionBtn = null; clusterSelections = [];
    const q = currentQuizQuestions[currentQuestionIndex];
    document.getElementById('question-counter').innerText = `Chặng ${currentQuestionIndex + 1}/${currentQuizQuestions.length}`;
    document.getElementById('question-content').classList.add('hidden');
    
    const optsContainer = document.getElementById('options-container'); optsContainer.innerHTML = '';
    document.getElementById('feedback').innerText = ''; document.getElementById('next-btn').classList.add('hidden');

    const labelsAlpha = ['A', 'B', 'C', 'D', 'E', 'F']; const labelsTF = ['a', 'b', 'c', 'd'];

    if (q.type === "reading-cluster") {
        const splitWrapper = document.createElement('div'); splitWrapper.className = 'split-layout';
        const leftCol = document.createElement('div'); leftCol.className = 'split-left';
        
        // --- THUẬT TOÁN TÁCH YÊU CẦU ĐỀ (MỚI) ---
        let contextHTML = "";
        let contextLines = q.context.split(/<br>|\n/);
        let firstLine = contextLines[0].replace(/<[^>]+>/g, '').trim();
        
        // Nếu dòng đầu là yêu cầu, ta dùng class .quiz-instruction đã tạo ở trên
        if (/(mark|choose|chọn|indicate|read|đọc|điền|hoàn thành)/i.test(firstLine) && firstLine.length > 15) {
            let instruction = contextLines.shift();
            contextHTML += `<div class="quiz-instruction">${formatText(instruction)}</div>`;
        }
        
        let passageText = contextLines.join('<br>');
        if (passageText.trim()) {
            // Phần văn bản này sẽ hiển thị font chữ mỏng (400) cho dễ nhìn
            contextHTML += `<div class="reading-passage">${formatText(passageText)}</div>`;
        }
        
        const passageWrapper = document.createElement('div');
        passageWrapper.innerHTML = contextHTML;
        leftCol.appendChild(passageWrapper);
        // -------------------------------------------------

        const rightCol = document.createElement('div'); rightCol.className = 'split-right';
        if (!isTestMode) clusterSelections = new Array(q.questions.length).fill(null);

        q.questions.forEach((subQ, idx) => {
            const subBlock = document.createElement('div'); subBlock.className = 'sub-question-block'; subBlock.id = `sub-q-${idx}`;
            const subTitle = document.createElement('div'); subTitle.className = 'sub-question-content'; subTitle.innerHTML = formatText(subQ.content); subBlock.appendChild(subTitle);

            if (subQ.type === "writing") {
                const textarea = document.createElement('textarea');
                textarea.className = "writing-textarea";
                textarea.placeholder = "Viết bài luận của bạn vào đây...";
                let savedVal = (isTestMode && testAnswers[currentQuestionIndex] && testAnswers[currentQuestionIndex][idx]) ? testAnswers[currentQuestionIndex][idx] : "";
                if (savedVal) textarea.value = savedVal;

                const wordCountDiv = document.createElement('div');
                wordCountDiv.className = "word-count-badge";
                wordCountDiv.innerText = `Số từ: ${savedVal ? savedVal.trim().split(/\s+/).length : 0}`;

                textarea.addEventListener('input', function() {
                    let text = this.value.trim();
                    let count = text ? text.split(/\s+/).length : 0;
                    wordCountDiv.innerText = `Số từ: ${count}`;
                    if (isTestMode) { testAnswers[currentQuestionIndex][idx] = this.value; updateDashboard(); } 
                    else { clusterSelections[idx] = this.value; }
                });

                subBlock.appendChild(textarea); subBlock.appendChild(wordCountDiv);
            } 
            else {
                let displayOptions = [...subQ.options];
                // Trong chế độ Luyện tập: Chỉ đảo vị trí ẢO hiển thị cho học sinh, không lưu vào Data
                if (!isTestMode && displayOptions.length > 2) {
                    for (let i = displayOptions.length - 1; i > 0; i--) { 
                        const j = Math.floor(Math.random() * (i + 1)); 
                        [displayOptions[i], displayOptions[j]] = [displayOptions[j], displayOptions[i]]; 
                    }
                }

                displayOptions.forEach((opt, optIdx) => {
                    const btn = document.createElement('button'); btn.className = 'option-btn sub-option-btn';
                    let cleanRenderText = formatText(cleanOpt(opt));
                    // Luôn luôn ép chữ A, B, C, D đứng cố định đầu dòng
                    btn.innerHTML = `<span style="font-weight:800; margin-right:10px; color:var(--primary);">${labelsAlpha[optIdx]}.</span> ${cleanRenderText}`;
                    
                    if (isTestMode && testAnswers[currentQuestionIndex][idx] === opt) btn.classList.add('selected');

                    btn.onclick = function() { 
                        if (isTestMode) {
                            // [ĐÃ FIX]: Lưu vào mảng 2 chiều cho đúng câu hỏi con
                            testAnswers[currentQuestionIndex][idx] = opt;
                            
                            // [ĐÃ FIX]: Chỉ xóa sáng nút cũ TRONG PHẠM VI 1 CÂU HỎI CON (subBlock)
                            subBlock.querySelectorAll('.sub-option-btn').forEach(b => b.classList.remove('selected'));
                            this.classList.add('selected'); 
                            updateDashboard();
                        } else { 
                            if (!document.getElementById('next-btn').classList.contains('hidden')) return;
                            
                            if (this.classList.contains('selected')) {
                                // [ĐÃ FIX]: Nút nộp bài của chùm là 'reading-submit-btn'
                                const submitBtn = document.getElementById('reading-submit-btn');
                                if (submitBtn && !submitBtn.classList.contains('hidden')) submitBtn.click();
                                return;
                            }

                            // [ĐÃ FIX]: Chỉ xóa sáng nút cũ TRONG PHẠM VI 1 CÂU HỎI CON (subBlock)
                            subBlock.querySelectorAll('.sub-option-btn').forEach(b => b.classList.remove('selected'));
                            this.classList.add('selected');
                            
                            // [ĐÃ FIX]: Ghi nhận đáp án vào đúng vị trí của mảng chùm
                            clusterSelections[idx] = opt;
                        }
                    };
                    subBlock.appendChild(btn);
                });
            }
            rightCol.appendChild(subBlock);
        });

        if (!isTestMode) {
            const submitBtn = document.createElement('button'); submitBtn.id = 'reading-submit-btn'; submitBtn.className = 'btn btn-primary'; submitBtn.style = 'width: 100%;'; submitBtn.innerText = 'Chốt đáp án Bài này'; submitBtn.onclick = submitReadingCluster; rightCol.appendChild(submitBtn);
        }

        splitWrapper.appendChild(leftCol); splitWrapper.appendChild(rightCol); optsContainer.appendChild(splitWrapper);
    }
    else if (q.type === "writing") {
        // THÊM NÚT BOOKMARK CHO CÂU TỰ LUẬN
var starBtnHTML = `<button onclick='toggleBookmark(${JSON.stringify(q).replace(/'/g, "&#39;")})' style='background: none; border: none; font-size: 22px; cursor: pointer; float: right; margin-top: -5px;' title='Lưu câu hỏi khó'>⭐️</button>`;
document.getElementById('question-content').innerHTML = starBtnHTML + formatText(q.content);
document.getElementById('question-content').classList.remove('hidden');
        
        const wrapper = document.createElement('div'); wrapper.style.width = "100%";
        const textarea = document.createElement('textarea');
        textarea.className = "writing-textarea";
        textarea.placeholder = "Viết bài luận của bạn vào đây...";
        
        let savedVal = (isTestMode && testAnswers[currentQuestionIndex]) ? testAnswers[currentQuestionIndex] : "";
        if (savedVal) textarea.value = savedVal;

        const wordCountDiv = document.createElement('div');
        wordCountDiv.className = "word-count-badge";
        wordCountDiv.style.marginBottom = "15px";
        wordCountDiv.innerText = `Số từ: ${savedVal ? savedVal.trim().split(/\s+/).length : 0}`;

        textarea.addEventListener('input', function() {
            let text = this.value.trim();
            let count = text ? text.split(/\s+/).length : 0;
            wordCountDiv.innerText = `Số từ: ${count}`;
            this.style.borderColor = "var(--primary)";
            if (isTestMode) { testAnswers[currentQuestionIndex] = this.value; updateDashboard(); }
        });

        wrapper.appendChild(textarea); wrapper.appendChild(wordCountDiv); optsContainer.appendChild(wrapper);
        
        if (!isTestMode) {
            const submitBtn = document.createElement('button'); submitBtn.id = 'writing-submit-btn'; submitBtn.className = 'btn btn-primary'; submitBtn.style = 'width: 100%;'; submitBtn.innerText = 'Lưu Bài Viết'; 
            submitBtn.onclick = () => {
                if (!textarea.value.trim()) { alert("Vui lòng viết gì đó trước khi chốt!"); return; }
                textarea.disabled = true; submitBtn.classList.add('hidden');
                document.getElementById('next-btn').classList.remove('hidden');
                document.getElementById('feedback').innerText = "Đã lưu bài viết. Hệ thống sẽ ghi nhận và gửi Giáo viên chấm điểm sau.";
                document.getElementById('feedback').style.color = "var(--primary)";
            };
            optsContainer.appendChild(submitBtn);
        }
    }
    else if (q.type === "short-answer") {
        // THÊM NÚT BOOKMARK CHO CÂU TRẢ LỜI NGẮN
var starBtnHTML = `<button onclick='toggleBookmark(${JSON.stringify(q).replace(/'/g, "&#39;")})' style='background: none; border: none; font-size: 22px; cursor: pointer; float: right; margin-top: -5px;' title='Lưu câu hỏi khó'>⭐️</button>`;
document.getElementById('question-content').innerHTML = starBtnHTML + formatText(q.content);
document.getElementById('question-content').classList.remove('hidden');
        
        const wrapper = document.createElement('div'); wrapper.style.width = "100%";
        const input = document.createElement('input'); input.type = "text"; input.id = "short-answer-input"; input.placeholder = "Nhập đáp án của bạn...";
        input.style.cssText = "width: 100%; padding: 18px 20px; font-size: 18px; border-radius: 8px; border: 2px solid var(--border-color); background: var(--bg-light); color: var(--primary); font-weight: 600; margin-bottom: 20px; box-sizing: border-box; text-align: center; transition: all 0.3s ease; font-family: inherit;";
        
        let savedVal = (isTestMode && testAnswers[currentQuestionIndex]) ? testAnswers[currentQuestionIndex] : "";
        if (savedVal) input.value = savedVal;

        input.addEventListener('input', function() {
            this.style.borderColor = "var(--primary)"; this.style.color = "var(--primary)"; this.style.backgroundColor = "var(--bg-light)";
            document.getElementById('feedback').innerText = '';
            if (isTestMode) { testAnswers[currentQuestionIndex] = this.value; updateDashboard(); }
        });
        input.addEventListener('keydown', function(e) { if (!isTestMode && e.key === 'Enter') { e.stopPropagation(); submitShortAnswer(); } });

        wrapper.appendChild(input); optsContainer.appendChild(wrapper);
        
        if (!isTestMode) {
            const submitBtn = document.createElement('button'); submitBtn.id = 'short-submit-btn'; submitBtn.className = 'btn btn-primary'; submitBtn.style = 'width: 100%;'; submitBtn.innerText = 'Chốt đáp án (Phím Enter)'; submitBtn.onclick = submitShortAnswer; optsContainer.appendChild(submitBtn);
        }
        setTimeout(() => document.getElementById('short-answer-input').focus(), 100);
    }
    else if (q.type === "cluster-tf") {
        // THÊM NÚT BOOKMARK CHO CỤM CÂU ĐÚNG/SAI
var starBtnHTML = `<button onclick='toggleBookmark(${JSON.stringify(q).replace(/'/g, "&#39;")})' style='background: none; border: none; font-size: 22px; cursor: pointer; float: right; margin-top: -5px;' title='Lưu câu hỏi khó'>⭐️</button>`;
document.getElementById('question-content').innerHTML = starBtnHTML + formatText(q.content);
document.getElementById('question-content').classList.remove('hidden');
        if (!isTestMode) clusterSelections = new Array(q.statements.length).fill(null);

        q.statements.forEach((stmt, index) => {
            const row = document.createElement('div'); row.className = 'tf-statement-row'; row.id = `tf-row-${index}`;
            const textDiv = document.createElement('div'); textDiv.className = 'tf-text';
            let cleanRenderText = formatText(cleanOpt(stmt.text));
            textDiv.innerHTML = `<span style="font-weight:800; margin-right:5px; color:var(--primary);">${labelsTF[index]})</span> ${cleanRenderText}`; 
            
            const actionsDiv = document.createElement('div'); actionsDiv.className = 'tf-actions';
            const btnTrue = document.createElement('button'); btnTrue.className = 'tf-btn btn-true'; btnTrue.innerText = 'Đúng'; 
            const btnFalse = document.createElement('button'); btnFalse.className = 'tf-btn btn-false'; btnFalse.innerText = 'Sai'; 
            
            if (isTestMode && testAnswers[currentQuestionIndex][index] === "Đúng") btnTrue.classList.add('selected');
            if (isTestMode && testAnswers[currentQuestionIndex][index] === "Sai") btnFalse.classList.add('selected');

            btnTrue.onclick = function() { 
                if(isTestMode) { testAnswers[currentQuestionIndex][index] = "Đúng"; btnTrue.classList.add('selected'); btnFalse.classList.remove('selected'); updateDashboard();
                } else selectClusterAnswer(index, "Đúng"); 
            };
            btnFalse.onclick = function() { 
                if(isTestMode) { testAnswers[currentQuestionIndex][index] = "Sai"; btnFalse.classList.add('selected'); btnTrue.classList.remove('selected'); updateDashboard();
                } else selectClusterAnswer(index, "Sai"); 
            };
            actionsDiv.appendChild(btnTrue); actionsDiv.appendChild(btnFalse); row.appendChild(textDiv); row.appendChild(actionsDiv); optsContainer.appendChild(row);
        });

        if (!isTestMode) {
            const submitBtn = document.createElement('button'); submitBtn.id = 'cluster-submit-btn'; submitBtn.className = 'btn btn-primary'; submitBtn.style = 'width: 100%; margin-top: 15px;'; submitBtn.innerText = 'Chốt đáp án bảng này (Hoặc bấm Enter)'; submitBtn.onclick = submitClusterAnswer; optsContainer.appendChild(submitBtn);
        }
    } 
    else {
        // THÊM NÚT BOOKMARK CHO CÂU TRẮC NGHIỆM
var starBtnHTML = `<button onclick='toggleBookmark(${JSON.stringify(q).replace(/'/g, "&#39;")})' style='background: none; border: none; font-size: 22px; cursor: pointer; float: right; margin-top: -5px;' title='Lưu câu hỏi khó'>⭐️</button>`;
document.getElementById('question-content').innerHTML = starBtnHTML + formatText(q.content);
document.getElementById('question-content').classList.remove('hidden');

        let displayOptions = [...q.options];
        if (!isTestMode && displayOptions.length > 2) {
            for (let i = displayOptions.length - 1; i > 0; i--) { 
                const j = Math.floor(Math.random() * (i + 1)); 
                [displayOptions[i], displayOptions[j]] = [displayOptions[j], displayOptions[i]]; 
            }
        }
        
        let practiceSelectedOpt = null; let practiceSelectedBtn = null;
        // Đã xóa lastTapTime để tránh xung đột khi gõ phím tắt nhanh

        displayOptions.forEach((opt, idx) => {
            const btn = document.createElement('button'); btn.className = 'option-btn';
            let cleanRenderText = formatText(cleanOpt(opt));
            btn.innerHTML = `<span style="font-weight:800; margin-right:10px; color:var(--primary);">${labelsAlpha[idx]}.</span> ${cleanRenderText}`;
            
            if (isTestMode && testAnswers[currentQuestionIndex] === opt) btn.classList.add('selected');

            btn.onclick = function() { 
                if (isTestMode) {
                    testAnswers[currentQuestionIndex] = opt;
                    optsContainer.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                    this.classList.add('selected'); updateDashboard();
                } else { 
                    if (!document.getElementById('next-btn').classList.contains('hidden')) return;
                    
                    // LÔ-GÍC KÉP MỚI: Chỉ chốt khi bấm/gõ phím vào đúng nút ĐANG ĐƯỢC CHỌN
                    if (this.classList.contains('selected')) {
                        const submitBtn = document.getElementById('normal-submit-btn');
                        if (submitBtn && !submitBtn.classList.contains('hidden')) submitBtn.click();
                        return;
                    }

                    optsContainer.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                    this.classList.add('selected');
                    practiceSelectedOpt = opt; practiceSelectedBtn = this;
                }
            };
            optsContainer.appendChild(btn);
        });

        if (!isTestMode) {
            const submitBtn = document.createElement('button'); submitBtn.id = 'normal-submit-btn'; submitBtn.className = 'btn btn-primary'; submitBtn.style = 'width: 100%; margin-top: 15px;'; submitBtn.innerText = 'Chốt đáp án (Hoặc bấm Enter)';
            submitBtn.onclick = () => {
                if (!practiceSelectedBtn) { alert("Vui lòng chọn 1 đáp án trước khi chốt!"); return; }
                let isCorrect = cleanOpt(practiceSelectedOpt) === cleanOpt(q.correctAnswer);
                checkAnswer(practiceSelectedBtn, practiceSelectedOpt, q.correctAnswer);
                if (isCorrect) submitBtn.classList.add('hidden');
                else { practiceSelectedBtn.classList.remove('selected'); practiceSelectedOpt = null; practiceSelectedBtn = null; }
            };
            optsContainer.appendChild(submitBtn);
        }
    }

    if (isTestMode) {
        const dashboardDiv = document.createElement('div'); dashboardDiv.className = 'test-nav-grid'; dashboardDiv.id = 'test-dashboard';
        currentQuizQuestions.forEach((questionData, i) => {
            const btn = document.createElement('div'); btn.className = 'test-nav-btn'; btn.innerText = i + 1; btn.id = `nav-btn-${i}`;
            if (i === currentQuestionIndex) btn.classList.add('current');
            if (isQuestionAnswered(i)) btn.classList.add('answered');
            btn.onclick = () => { currentQuestionIndex = i; renderQuestion(); };
            dashboardDiv.appendChild(btn);
        });
        optsContainer.appendChild(dashboardDiv);

        const navDiv = document.createElement('div'); navDiv.style.cssText = "display:flex; justify-content:space-between; margin-top:20px; gap:10px;";
        const prevBtn = document.createElement('button'); prevBtn.className = 'btn btn-secondary'; prevBtn.innerHTML = '&#8592; Câu trước'; prevBtn.disabled = currentQuestionIndex === 0;
        prevBtn.onclick = () => { currentQuestionIndex--; renderQuestion(); };
        const nextBtnTest = document.createElement('button'); nextBtnTest.className = 'btn btn-secondary'; nextBtnTest.innerHTML = currentQuestionIndex === currentQuizQuestions.length - 1 ? 'Xem lại' : 'Câu tiếp &#8594;';
        nextBtnTest.onclick = () => { if(currentQuestionIndex < currentQuizQuestions.length - 1) { currentQuestionIndex++; renderQuestion(); } };
        const finalSubmitBtn = document.createElement('button'); finalSubmitBtn.className = 'btn btn-primary'; finalSubmitBtn.style.cssText = "background-color:var(--danger); color:#fff; border:none;"; finalSubmitBtn.innerText = 'Nộp Bài'; finalSubmitBtn.onclick = () => confirmSubmitTest(false);

        navDiv.appendChild(prevBtn); navDiv.appendChild(nextBtnTest); navDiv.appendChild(finalSubmitBtn); optsContainer.appendChild(navDiv);
    }

    // Hàm mới thay thế triggerMathJax cũ
function triggerMathJax() {
    if (typeof MathJax === 'undefined' || !MathJax.typesetPromise) {
        setTimeout(triggerMathJax, 50);
        return;
    }

    const questionDiv = document.getElementById('question-content');
    const optionsDiv = document.getElementById('options-container');

    const elements = [];
    if (questionDiv) elements.push(questionDiv);
    if (optionsDiv) elements.push(optionsDiv);

    if (elements.length === 0) return;

    MathJax.typesetPromise(elements).catch(err => {
        console.warn('MathJax render error:', err);
    });
}
triggerMathJax();
    triggerMathJax();
}

function updateDashboard() {
    const btn = document.getElementById(`nav-btn-${currentQuestionIndex}`);
    if (btn && isQuestionAnswered(currentQuestionIndex)) { btn.classList.add('answered'); }
}

function isQuestionAnswered(idx) {
    let ans = testAnswers[idx]; let q = currentQuizQuestions[idx];
    if (q.type === 'normal' && ans) return true;
    if (q.type === 'short-answer' && ans && ans.trim() !== "") return true;
    if (q.type === 'writing' && ans && ans.trim() !== "") return true;
    if ((q.type === 'cluster-tf' || q.type === 'reading-cluster') && ans && !ans.includes(null) && !ans.includes("")) return true;
    return false;
}

/* ==========================================
   7. LOGIC CHẤM ĐIỂM & RENDER KẾT QUẢ TẤT CẢ CÂU
========================================== */
/* ==========================================
   BỘ CÔNG CỤ HIỆU ỨNG & ÂM THANH (ĐÃ FIX LỖI TỊT ÂM)
========================================== */
let vAudioCtx = null;
function getAudioCtx() {
    if (!vAudioCtx) { vAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    if (vAudioCtx.state === 'suspended') { vAudioCtx.resume(); }
    return vAudioCtx;
}

function playCorrectSound() {
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator(); 
        const gainNode = ctx.createGain();
        
        // Âm thanh đúng: Tần số trầm ấm hơn, ngân dài tạo độ vang nhẹ
        osc.type = 'sine'; 
        osc.frequency.setValueAtTime(500, ctx.currentTime); 
        osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.1); 
        
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime); 
        // Kéo dài thời gian release từ 0.3 lên 1.0 giây để tạo tiếng vang (echo)
        gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.0); 
        
        osc.connect(gainNode); 
        gainNode.connect(ctx.destination);
        osc.start(); 
        osc.stop(ctx.currentTime + 1.0);
    } catch (e) {}
}

function playErrorSound() {
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator(); 
        const gainNode = ctx.createGain();
        // Đổi sang sóng triangle và tần số cao hơn để dễ nghe trên loa điện thoại
        osc.type = 'triangle'; 
        osc.frequency.setValueAtTime(300, ctx.currentTime); 
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime); 
        gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
        osc.connect(gainNode); gainNode.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
}

// Bỏ tính năng đẩy cao độ âm thanh (Pitch up), giờ combo cũng sẽ phát âm thanh mượt mà như bình thường
function playComboSound(streakCount) {
    playCorrectSound();
}
function showFloatingPoints(element, points) {
    const rect = element.getBoundingClientRect(); const pt = document.createElement('div');
    pt.className = 'floating-points'; pt.innerText = `+${points}`;
    pt.style.left = `${rect.left + rect.width / 2 - 20}px`; pt.style.top = `${rect.top}px`;
    document.body.appendChild(pt); setTimeout(() => pt.remove(), 1000);
}

function triggerConfetti() {
    if(typeof confetti !== 'undefined') {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b'] });
    }
}

async function confirmSubmitTest(isForced) {
    let forced = isForced === true; 
    let missing = [];
    testAnswers.forEach((ans, i) => { if (!isQuestionAnswered(i)) missing.push(i + 1); });

    let msg = missing.length > 0 ? `LƯU Ý: Bạn còn bỏ sót các chặng: ${missing.join(', ')}.\nBạn có chắc chắn muốn nộp bài không?` : `Bạn đã hoàn thành 100% đề thi. Bạn có chắc chắn nộp bài?`;

    if (forced || confirm(msg)) {
        if (quizTimerInterval) clearInterval(quizTimerInterval);
        
        let hsName = localStorage.getItem('studentName') || "Học sinh ẩn danh";
        let hsClass = localStorage.getItem('studentClass') || "Không rõ";

        sessionCorrectCount = 0; sessionResultList = []; let wrongQuestionsText = ""; 
        
        currentQuizQuestions.forEach((q, i) => {
            let ans = testAnswers[i];
            if (q.type === 'normal') {
                let isC = ans && cleanOpt(ans) === cleanOpt(q.correctAnswer);
                if (isC) sessionCorrectCount++; else wrongQuestionsText += `Câu ${i+1}; `;
                sessionResultList.push({ isCorrect: isC, type: 'normal', questionNum: i + 1, content: q.content, options: q.options, correctAnswer: q.correctAnswer, userAnswer: ans, explanation: q.explanation });
            } 
            else if (q.type === 'writing') {
                wrongQuestionsText += `Câu ${i+1} (Bài luận); `;
                sessionResultList.push({ isCorrect: true, type: 'writing', questionNum: i + 1, content: q.content, userAnswer: ans, explanation: q.explanation });
            }
            else if (q.type === 'short-answer') {
                let formattedUser = (ans || "").replace(/\s+/g, '').toLowerCase(); let formattedCorrect = q.correctAnswer.replace(/\s+/g, '').toLowerCase();
                let isC = formattedUser === formattedCorrect && formattedUser !== "";
                if (isC) sessionCorrectCount++; else wrongQuestionsText += `Câu ${i+1}; `;
                sessionResultList.push({ isCorrect: isC, type: 'short-answer', questionNum: i + 1, content: q.content, correctAnswer: q.correctAnswer, userAnswer: ans, explanation: q.explanation });
            } 
            else if (q.type === 'cluster-tf') {
                let allCorrect = true;
                if (ans && !ans.includes(null)) { q.statements.forEach((stmt, j) => { if (String(ans[j]).trim() !== String(stmt.correctAnswer).trim()) allCorrect = false; }); } else { allCorrect = false; }
                if (allCorrect) sessionCorrectCount++; else wrongQuestionsText += `Câu ${i+1} (Bảng); `;
                sessionResultList.push({ isCorrect: allCorrect, type: 'cluster-tf', questionNum: i + 1, content: `[Mệnh đề bảng] Câu hỏi số ${i + 1}`, statements: q.statements, userAnswer: ans, explanation: q.explanation });
            } 
            else if (q.type === 'reading-cluster') {
                let subQs = []; let allSubC = true;
                if (ans) {
                    q.questions.forEach((subQ, j) => {
                        if (subQ.type === 'writing') {
                            wrongQuestionsText += `Câu ${i+1}.${j+1} (Bài luận); `;
                            subQs.push({ isCorrect: true, type: 'writing', questionNum: `${i + 1}.${j + 1}`, content: subQ.content, userAnswer: ans[j], explanation: subQ.explanation });
                        } else {
                            let cleanU = cleanOpt(ans[j]); let cleanC = cleanOpt(subQ.correctAnswer);
                            let isSubC = cleanU === cleanC && cleanU !== "";
                            if (isSubC) { sessionCorrectCount++; } else { allSubC = false; wrongQuestionsText += `Câu ${i+1}.${j+1}; `; }
                            subQs.push({ isCorrect: isSubC, type: 'normal', questionNum: `${i + 1}.${j + 1}`, content: subQ.content, options: subQ.options, correctAnswer: subQ.correctAnswer, userAnswer: ans[j], explanation: subQ.explanation });
                        }
                    });
                } else {
                    allSubC = false;
                    q.questions.forEach((subQ, j) => {
                        wrongQuestionsText += `Câu ${i+1}.${j+1}; `;
                        subQs.push({ isCorrect: false, type: subQ.type === 'writing' ? 'writing' : 'normal', questionNum: `${i + 1}.${j + 1}`, content: subQ.content, options: subQ.options, correctAnswer: subQ.correctAnswer, userAnswer: null, explanation: subQ.explanation });
                    });
                }
                sessionResultList.push({ isCorrect: allSubC, type: 'reading-cluster', context: q.context, translation: q.translation, subQuestions: subQs });
            }
        });

        let totalRealQuestions = 0;
        currentQuizQuestions.forEach(q => { 
            if (q.type === 'reading-cluster') {
                q.questions.forEach(sq => { if (sq.type !== 'writing') totalRealQuestions += 1; });
            } else if (q.type !== 'writing') { totalRealQuestions += 1; }
        });
        
        let scoreString = `${sessionCorrectCount}/${totalRealQuestions}`;
        
        let detailedFeedback = wrongQuestionsText || "Làm đúng 100%";
        sessionResultList.forEach(r => {
            if (r.type === 'writing' && r.userAnswer) { detailedFeedback += `\n[BÀI LUẬN CÂU ${r.questionNum}]:\n${r.userAnswer}\n`; }
            if (r.type === 'reading-cluster') {
                r.subQuestions.forEach(sq => { if (sq.type === 'writing' && sq.userAnswer) detailedFeedback += `\n[BÀI LUẬN CÂU ${sq.questionNum}]:\n${sq.userAnswer}\n`; });
            }
        });

        const payload = { action: "submit_score", date: new Date().toLocaleString('vi-VN'), name: hsName, className: hsClass, subject: currentSubject, quizTitle: db[currentSubject][currentQuizIndex].title, score: scoreString, wrongDetails: detailedFeedback };
        fetch(CLOUD_API_URL, { method: 'POST', headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }).catch(err => console.log("Lỗi gửi điểm", err));

        const currentQuiz = db[currentSubject][currentQuizIndex];
        await updateUserProgress(currentSubject, currentQuiz.title, true, scoreString);

        delete db[currentSubject][currentQuizIndex].progress; localStorage.setItem('myStudyData', JSON.stringify(db));
        showResults();
    }
}

// [FIX LỖI MỜ CHỮ TRONG JAVASCRIPT] 
// Thay thế các background inline cứng nhắc bằng var(--card-bg) để kế thừa độ tương phản của chế độ Sáng/Tối
function showResults() {
    showScreen('screen-result'); document.getElementById('app-title').innerText = "Hoàn Thành";
    
    let totalRealQuestions = 0;
    currentQuizQuestions.forEach(q => { 
        if (q.type === 'reading-cluster') {
            q.questions.forEach(sq => { if (sq.type !== 'writing') totalRealQuestions += 1; });
        } else if (q.type !== 'writing') { totalRealQuestions += 1; }
    });

    document.getElementById('final-score').innerText = `${sessionCorrectCount}/${totalRealQuestions}`;
    document.getElementById('correct-count').innerText = sessionCorrectCount;
    
    let wrongCount = 0;
    sessionResultList.forEach(item => {
        if(item.type === 'reading-cluster') { item.subQuestions.forEach(sq => { if(sq.type !== 'writing' && !sq.isCorrect) wrongCount++; }); }
        else { if(item.type !== 'writing' && !item.isCorrect) wrongCount++; }
    });
    document.getElementById('incorrect-count').innerText = wrongCount;

    const wrongListDiv = document.getElementById('wrong-answers-list'); wrongListDiv.innerHTML = '';
    
    if (sessionResultList.length > 0) {
        document.getElementById('wrong-answers-container').classList.remove('hidden');
        
        sessionResultList.forEach(item => {
            const div = document.createElement('div'); div.className = 'wrong-item';
            let borderColor = (item.type === 'writing' || item.isCorrect) ? "var(--success)" : "var(--danger)";
            if (item.type === 'reading-cluster') borderColor = item.isCorrect ? "var(--success)" : "var(--danger)";
            
            // [FIX MÀU NỀN] Dùng var(--card-bg) thay vì rgba mờ để tăng độ nét
            div.style.cssText = `background: var(--card-bg); border: 1px solid ${borderColor}; border-radius: 12px; padding: 20px; margin-bottom: 25px; border-left: 4px solid ${borderColor}; box-shadow: var(--shadow-soft);`;
            let html = ``;

            if (item.type === 'reading-cluster') {
                html += `<div style="background: var(--card-bg-elevated); padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--border-color);">
                            <h4 style="margin-top:0; color: var(--primary);">📄 Ngữ liệu:</h4>
                            <div style="margin-bottom: 15px; font-size: 15px; color: var(--text-main);">${formatText(item.context)}</div>`;
                // [FIX MÀU CHỮ] Đổi màu chữ bản dịch thành primary để nổi bật
                if (item.translation) { html += `<h4 style="margin-top:0; color: var(--success);">🇻🇳 Bản dịch:</h4><div style="font-size: 15px; color: var(--text-main); opacity: 0.9;">${formatText(item.translation)}</div>`; }
                html += `</div>`;
                item.subQuestions.forEach(sub => { html += renderSingleQuestionResult(sub); });
            } else { html += renderSingleQuestionResult(item); }
            
            div.innerHTML = html; wrongListDiv.appendChild(div);
        });
    } else { document.getElementById('wrong-answers-container').classList.add('hidden'); }

    // [MỚI] HIỂN THỊ VIDEO YOUTUBE NẾU CÓ
    const quizData = db[currentSubject][currentQuizIndex];
    const videoContainer = document.getElementById('result-video-container');
    const fallbackLink = document.getElementById('result-video-fallback');

    if (quizData && quizData.youtubeLink) {
        let embedUrl = getYoutubeEmbedUrl(quizData.youtubeLink);
        if (embedUrl) {
            document.getElementById('result-video-iframe').src = embedUrl;
            if (fallbackLink) fallbackLink.href = quizData.youtubeLink; // Gắn link gốc vào nút dự phòng
            videoContainer.classList.remove('hidden');
        } else {
            videoContainer.classList.add('hidden');
        }
    } else {
        videoContainer.classList.add('hidden');
        document.getElementById('result-video-iframe').src = "";
    }

    // BỔ SUNG: Kiểm soát nút Thoát dựa trên chế độ Cách ly
    const exitBtn = document.querySelector('#screen-result button[onclick="exitQuiz()"]');
    if (exitBtn) {
        if (isIsolatedMode) {
            // Đổi nút Thoát thành nút Chơi Lại nếu đang bị "Nhốt"
            exitBtn.innerText = "Làm lại bài này 🔄";
            exitBtn.onclick = () => {
                const isTest = db[currentSubject][currentQuizIndex].progress ? db[currentSubject][currentQuizIndex].progress.isTestMode : true;
                startQuiz(currentQuizIndex, isTest); // Gọi lại chính đề này
            };
        } else {
            // Trả lại nguyên trạng nếu là dùng bình thường
            exitBtn.innerText = "Hoàn tất & Thoát";
            exitBtn.onclick = exitQuiz;
        }
    }

    function triggerMathJaxResult() {
        if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) { MathJax.typesetPromise([document.getElementById('wrong-answers-container')]).catch((err) => console.log('MathJax error: ', err)); } else { setTimeout(triggerMathJaxResult, 100); }
    }
    triggerMathJaxResult();
}

function renderSingleQuestionResult(q) {
    let h = `<div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px dashed var(--border-color);">`;
    
    if (q.type === 'writing') {
        h += `<div style="font-weight: bold; font-size: 16px; margin-bottom: 15px; color: var(--primary);">✍️ Câu ${q.questionNum}: ${formatText(q.content)}</div>`;
        h += `<div style="margin-bottom: 15px; background: var(--card-bg-elevated); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
                <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase;">BÀI LÀM CỦA BẠN:</div>
                <div style="color: var(--text-main); white-space: pre-wrap; font-family: inherit;">${q.userAnswer || 'Không có nội dung'}</div>
              </div>`;
    } else {
        let icon = q.isCorrect ? "✅" : "❌";
        let titleColor = q.isCorrect ? "var(--success)" : "var(--danger)";
        h += `<div style="font-weight: bold; font-size: 16px; margin-bottom: 15px; color: ${titleColor};">${icon} Câu ${q.questionNum}: ${formatText(q.content)}</div>`;

        if (q.options && q.options.length > 0) {
            h += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">`;
            
            const labelsResult = ['A', 'B', 'C', 'D', 'E', 'F']; 
            
            q.options.forEach((opt, idx) => { 
                let cleanO = cleanOpt(opt); 
                let isCorrectOpt = false;
                let isSelected = false;

                // [FIX LỖI XANH HẾT] Nhận diện thông minh:
                // Nếu là phiếu trắc nghiệm (FAST-KEYS), so sánh chuỗi gốc chưa gọt để phân biệt được A, B, C, D
                if (cleanO.includes('bubble-opt')) {
                    isCorrectOpt = opt.trim() === (q.correctAnswer || '').trim();
                    isSelected = q.userAnswer && opt.trim() === q.userAnswer.trim();
                } else {
                    // Nếu là đề thường, dùng thuật toán gọt chữ như cũ
                    isCorrectOpt = cleanO === cleanOpt(q.correctAnswer);
                    isSelected = q.userAnswer && cleanOpt(q.userAnswer) === cleanO;
                }
                
                let bg = "var(--card-bg-elevated)"; let border = "1px solid var(--border-color)"; let color = "var(--text-main)";
                
                if (isCorrectOpt) { bg = "rgba(22, 163, 74, 0.1)"; border = "2px solid var(--success)"; color = "var(--success)"; } 
                else if (isSelected && !isCorrectOpt) { bg = "rgba(239, 68, 68, 0.1)"; border = "2px solid var(--danger)"; color = "var(--danger)"; }
                
                let displayHTML = cleanO.includes('bubble-opt') 
                    ? `<div style="text-align: center; font-size: 18px; font-weight: 900;">${labelsResult[idx] || ''}</div>` 
                    : `<strong style="margin-right: 5px;">${labelsResult[idx] || ''}.</strong> ${cleanO}`;

                h += `<div style="padding: 12px; border-radius: 8px; background: ${bg}; border: ${border}; color: ${color}; font-weight: 500;">${displayHTML}</div>`;
            });
            h += `</div>`;
        } 
        else if (q.type === 'cluster-tf') {
            h += `<div style="margin-bottom: 15px; background: var(--card-bg-elevated); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);">`;
            q.statements.forEach((stmt, j) => {
                let uA = q.userAnswer ? q.userAnswer[j] : null;
                let cA = stmt.correctAnswer;
                let sColor = (uA === cA) ? "var(--success)" : "var(--danger)";
                let sIcon = (uA === cA) ? "✅" : "❌";
                h += `<div style="margin-bottom: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                        <div style="color: var(--text-main);">- ${formatText(stmt.text)}</div>
                        <div style="color: ${sColor}; font-size: 14px; margin-top: 4px; font-weight: bold;">${sIcon} Bạn chọn: <b>${uA || 'Bỏ trống'}</b> | Đáp án: <b>${cA}</b></div>
                      </div>`;
            });
            h += `</div>`;
        }
        else if (q.type === 'short-answer') {
             h += `<div style="margin-bottom: 15px; background: var(--card-bg-elevated); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);">
                     <span style="color: var(--danger); font-weight: bold;">✍️ Đã điền: ${q.userAnswer || 'Bỏ trống'}</span><br>
                     <span style="color: var(--success); font-weight: bold;">🎯 Đáp án đúng: ${cleanOpt(q.correctAnswer)}</span>
                   </div>`;
        }
    }

    if (q.explanation) { h += `<div class="explanation-box" style="color: var(--text-main);"><strong>💡 Giải thích:</strong><br>${formatText(q.explanation)}</div>`; }
    h += `</div>`; return h;
}

function selectReadingAnswer(qIdx, selectedOpt, btnEl) {
    if (!document.getElementById('next-btn').classList.contains('hidden')) return;
    clusterSelections[qIdx] = selectedOpt; 
    const block = document.getElementById(`sub-q-${qIdx}`);
    block.querySelectorAll('.sub-option-btn').forEach(b => b.classList.remove('selected', 'incorrect-btn')); 
    btnEl.classList.add('selected');
}

/* ==========================================================
   BỘ 4 HÀM CHẤM ĐIỂM (ĐÃ FIX LUẬT: CHỈ TÍNH ĐIỂM LẦN ĐẦU BẤM)
========================================================== */

function selectClusterAnswer(index, value) {
    if (!document.getElementById('next-btn').classList.contains('hidden')) return; 
    clusterSelections[index] = value;
    const row = document.getElementById(`tf-row-${index}`); 
    const btnTrue = row.querySelector('.btn-true'); const btnFalse = row.querySelector('.btn-false');
    btnTrue.classList.remove('selected', 'incorrect-btn'); btnFalse.classList.remove('selected', 'incorrect-btn');
    if (value === "Đúng") btnTrue.classList.add('selected'); if (value === "Sai") btnFalse.classList.add('selected');
}

function checkAnswer(btnElement, selected, correct) {
    const feedback = document.getElementById('feedback');
    const q = currentQuizQuestions[currentQuestionIndex];
    let isC = cleanOpt(selected) === cleanOpt(correct);
    
    // Thuật toán quét Sổ điểm: Xem câu này đã từng bị chấm chưa?
    let alreadyAnswered = sessionResultList.some(res => res.questionNum === currentQuestionIndex + 1);

    if (!alreadyAnswered) {
        // NẾU LÀ LẦN BẤM ĐẦU TIÊN -> GHI SỔ ĐIỂM CHÍNH THỨC
        if (isC) sessionCorrectCount++;
        sessionResultList.push({ 
            isCorrect: isC, type: 'normal', questionNum: currentQuestionIndex + 1, 
            content: q.content, options: q.options, correctAnswer: q.correctAnswer, 
            userAnswer: selected, explanation: q.explanation 
        });
        testAnswers[currentQuestionIndex] = selected; 
    }

    // Hiệu ứng giao diện (Luôn chạy để học sinh biết đúng sai)
    if (isC) {
        playCorrectSound();
        btnElement.classList.add('correct-btn');
        feedback.innerText = "Chính xác! Tuyệt vời!"; feedback.style.color = "var(--success)";
        document.getElementById('next-btn').classList.remove('hidden');
        document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
    } else {
        feedback.innerText = "Sai rồi, hãy chọn đáp án khác!"; feedback.style.color = "var(--danger)";
        btnElement.classList.add('incorrect-btn');
        setTimeout(() => { btnElement.classList.remove('incorrect-btn'); }, 800);
    }
}

function submitClusterAnswer() {
    if (!document.getElementById('next-btn').classList.contains('hidden')) return;
    if (clusterSelections.includes(null)) { alert("Vui lòng chọn Đúng/Sai cho tất cả các mệnh đề trước khi chốt!"); return; }
    
    const q = currentQuizQuestions[currentQuestionIndex];
    let allCorrect = true;
    q.statements.forEach((stmt, i) => { 
        let uAns = clusterSelections[i] ? clusterSelections[i].toString().trim().toLowerCase() : "";
        let cAns = stmt.correctAnswer ? stmt.correctAnswer.toString().trim().toLowerCase() : "";
        if (uAns !== cAns) allCorrect = false; 
    });
    
    const feedback = document.getElementById('feedback');
    let alreadyAnswered = sessionResultList.some(res => res.questionNum === currentQuestionIndex + 1);

    if (!alreadyAnswered) {
        if (allCorrect) sessionCorrectCount++;
        sessionResultList.push({ 
            isCorrect: allCorrect, type: 'cluster-tf', questionNum: currentQuestionIndex + 1, 
            content: `[Mệnh đề bảng] Câu hỏi số ${currentQuestionIndex + 1}`, 
            statements: q.statements, userAnswer: [...clusterSelections], explanation: q.explanation 
        });
        testAnswers[currentQuestionIndex] = [...clusterSelections];
    }
    
    if (allCorrect) {
        playCorrectSound();
        document.getElementById('cluster-submit-btn').classList.add('hidden'); 
        document.getElementById('next-btn').classList.remove('hidden');
        q.statements.forEach((stmt, i) => {
            const row = document.getElementById(`tf-row-${i}`);
            if(row) {
                const btnTrue = row.querySelector('.btn-true'); const btnFalse = row.querySelector('.btn-false');
                if(btnTrue) btnTrue.disabled = true; if(btnFalse) btnFalse.disabled = true;
                const selectedBtn = clusterSelections[i] === "Đúng" ? btnTrue : btnFalse;
                if(selectedBtn) { selectedBtn.classList.remove('selected', 'incorrect-btn'); selectedBtn.classList.add('correct-btn'); }
            }
        });
        feedback.innerText = "Tuyệt vời! Bạn phân tích đúng toàn bộ các mệnh đề."; feedback.style.color = "var(--success)";
    } else {
        feedback.innerText = "Có mệnh đề sai. Hãy phân tích và chọn lại!"; feedback.style.color = "var(--danger)";
        q.statements.forEach((stmt, i) => {
            const row = document.getElementById(`tf-row-${i}`);
            if(row) {
                const btnTrue = row.querySelector('.btn-true'); const btnFalse = row.querySelector('.btn-false');
                if(btnTrue) btnTrue.classList.remove('incorrect-btn'); if(btnFalse) btnFalse.classList.remove('incorrect-btn');
                let uAns = clusterSelections[i] ? clusterSelections[i].toString().trim().toLowerCase() : "";
                let cAns = stmt.correctAnswer ? stmt.correctAnswer.toString().trim().toLowerCase() : "";
                if (uAns !== cAns) {
                    const wrongBtn = clusterSelections[i] === "Đúng" ? btnTrue : btnFalse;
                    if(wrongBtn) { wrongBtn.classList.add('incorrect-btn'); setTimeout(() => wrongBtn.classList.remove('incorrect-btn'), 800); }
                }
            }
        });
    }
}

function submitReadingCluster() {
    if (!document.getElementById('next-btn').classList.contains('hidden')) return;
    if (clusterSelections.includes(null)) { alert("Vui lòng chọn đáp án cho TẤT CẢ các câu hỏi trong phần này!"); return; }
    
    const q = currentQuizQuestions[currentQuestionIndex];
    let allCorrect = true; let correctInCluster = 0; let subQs = [];
    
    q.questions.forEach((subQ, i) => {
        if (subQ.type === 'writing') {
            subQs.push({ isCorrect: true, type: 'writing', questionNum: `${currentQuestionIndex + 1}.${i + 1}`, content: subQ.content, userAnswer: clusterSelections[i], explanation: subQ.explanation });
        } else {
            let cleanU = cleanOpt(clusterSelections[i]); let cleanC = cleanOpt(subQ.correctAnswer);
            let isC = cleanU === cleanC;
            if (isC) correctInCluster++; else allCorrect = false;
            subQs.push({ isCorrect: isC, type: 'normal', questionNum: `${currentQuestionIndex + 1}.${i + 1}`, content: subQ.content, options: subQ.options, correctAnswer: subQ.correctAnswer, userAnswer: clusterSelections[i], explanation: subQ.explanation });
        }
    });
    
    const totalMCQ = q.questions.filter(sq => sq.type !== 'writing').length;
    const feedback = document.getElementById('feedback');
    let alreadyAnswered = sessionResultList.some(res => res.questionNum === currentQuestionIndex + 1);
    
    if (!alreadyAnswered) {
        sessionResultList.push({ isCorrect: allCorrect, type: 'reading-cluster', context: q.context, translation: q.translation, subQuestions: subQs });
        subQs.forEach(sq => { if (sq.type === 'normal' && sq.isCorrect) sessionCorrectCount++; });
        testAnswers[currentQuestionIndex] = [...clusterSelections];
    }

    if (allCorrect) {
        playCorrectSound();
        document.getElementById('reading-submit-btn').classList.add('hidden'); document.getElementById('next-btn').classList.remove('hidden');
        q.questions.forEach((subQ, i) => {
            const block = document.getElementById(`sub-q-${i}`);
            if (subQ.type === 'writing') { const ta = block.querySelector('textarea'); if (ta) ta.disabled = true; } 
            else {
                let userAnsStrip = cleanOpt(clusterSelections[i]); let correctAnsStrip = cleanOpt(subQ.correctAnswer);
                block.querySelectorAll('.sub-option-btn').forEach(b => {
                    let btnContentOnly = cleanOpt(b.innerText); b.disabled = true;
                    if (btnContentOnly === correctAnsStrip) { b.classList.add('correct-btn'); } 
                    else if (btnContentOnly === userAnsStrip && userAnsStrip !== correctAnsStrip) { b.classList.add('incorrect-btn'); }
                });
            }
        });
        feedback.innerText = `Tuyệt vời! Bạn đã làm đúng toàn bộ.`; feedback.style.color = "var(--success)";
    } else {
        feedback.innerText = `Bạn làm đúng ${correctInCluster}/${totalMCQ} câu. Hãy sửa các câu sai rồi chốt lại!`; feedback.style.color = "var(--danger)";
        q.questions.forEach((subQ, i) => {
            if (subQ.type !== 'writing') {
                let userAnsStrip = cleanOpt(clusterSelections[i]); let correctAnsStrip = cleanOpt(subQ.correctAnswer);
                if (userAnsStrip !== correctAnsStrip) {
                    const block = document.getElementById(`sub-q-${i}`);
                    block.querySelectorAll('.sub-option-btn').forEach(b => {
                        if (cleanOpt(b.innerText) === userAnsStrip) { b.classList.add('incorrect-btn'); setTimeout(() => b.classList.remove('incorrect-btn'), 800); }
                    });
                }
            }
        });
    }
}

function submitShortAnswer() {
    if (!document.getElementById('next-btn').classList.contains('hidden')) return;
    const inputEl = document.getElementById('short-answer-input');
    let userAns = inputEl.value.trim();
    if (userAns === "") { alert("Vui lòng nhập đáp án vào ô trống!"); return; }
    
    const q = currentQuizQuestions[currentQuestionIndex];
    const feedback = document.getElementById('feedback');
    let formattedUser = userAns.replace(/\s+/g, '').toLowerCase(); let formattedCorrect = q.correctAnswer.replace(/\s+/g, '').toLowerCase();
    let isC = formattedUser === formattedCorrect && formattedUser !== "";
    
    let alreadyAnswered = sessionResultList.some(res => res.questionNum === currentQuestionIndex + 1);

    if (!alreadyAnswered) {
        if (isC) sessionCorrectCount++;
        sessionResultList.push({ isCorrect: isC, type: 'short-answer', questionNum: currentQuestionIndex + 1, content: q.content, correctAnswer: q.correctAnswer, userAnswer: userAns, explanation: q.explanation });
        testAnswers[currentQuestionIndex] = userAns;
    }

    if (isC) {
        playCorrectSound();
        inputEl.style.borderColor = "var(--success)"; inputEl.style.color = "var(--success)"; inputEl.style.backgroundColor = "rgba(16, 185, 129, 0.05)"; inputEl.disabled = true;
        document.getElementById('short-submit-btn').classList.add('hidden'); document.getElementById('next-btn').classList.remove('hidden');
        feedback.innerText = "Chính xác! Tư duy rất tuyệt vời."; feedback.style.color = "var(--success)";
    } else {
        feedback.innerText = "Chưa chính xác, hãy nhập lại đáp án!"; feedback.style.color = "var(--danger)";
        inputEl.style.borderColor = "var(--danger)"; inputEl.style.color = "var(--danger)"; inputEl.style.backgroundColor = "rgba(239, 68, 68, 0.05)";
    }
}

function nextQuestion() { currentQuestionIndex++; renderQuestion(); }

/* ==========================================
   9. SỰ KIỆN BÀN PHÍM VÀ CÁC CÔNG CỤ (FIX LỖI TOGGLE ĐÚNG/SAI)
========================================== */
document.addEventListener('keydown', function(event) {
    const practiceScreen = document.getElementById('screen-practice');
    if (practiceScreen.classList.contains('hidden') || document.getElementById('exit-modal-overlay')) return; 
    
    const isTyping = document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.isContentEditable;
    if (isTyping) return; // Đang gõ chữ thì không nhận phím tắt

    const q = currentQuizQuestions[currentQuestionIndex];
    const isQuestionCompleted = !document.getElementById('next-btn').classList.contains('hidden');

    // 1. Phím Enter: Chốt đáp án hoặc Next câu
    if (event.key === 'Enter') {
        event.preventDefault();
        if (isQuestionCompleted) { nextQuestion(); return; }
        if (!isTestMode) {
            if (q.type === "reading-cluster") submitReadingCluster();
            else if (q.type === "cluster-tf") submitClusterAnswer();
            else if (q.type === "short-answer") submitShortAnswer();
            else { const btn = document.getElementById('normal-submit-btn'); if (btn) btn.click(); }
        } else if (q.type === "short-answer" && currentQuestionIndex < currentQuizQuestions.length - 1) {
            currentQuestionIndex++; renderQuestion();
        }
        return;
    }

    // 2. Phím 1, 2, 3, 4: Chọn đáp án / Đảo Đúng Sai
    const keyMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
    if (keyMap.hasOwnProperty(event.key) && !isQuestionCompleted) {
        const index = keyMap[event.key];
        
        // --- XỬ LÝ CÂU ĐÚNG/SAI (THUẬT TOÁN NHẤN ĐỂ LẬT) ---
        if (q.type === "cluster-tf") {
            const tfRows = document.querySelectorAll('.tf-statement-row');
            if (tfRows.length > 0 && index < tfRows.length) {
                const row = tfRows[index];
                const btnTrue = row.querySelector('.btn-true');
                const btnFalse = row.querySelector('.btn-false');
                
                if (btnTrue && btnFalse) {
                    const isTrueSelected = btnTrue.classList.contains('selected');
                    const isFalseSelected = btnFalse.classList.contains('selected');

                    if (!isTrueSelected && !isFalseSelected) {
                        btnTrue.click(); // Chưa chọn gì -> Bấm lần 1 chọn ĐÚNG
                    } else if (isTrueSelected) {
                        btnFalse.click(); // Đang Đúng -> Bấm lần 2 lật sang SAI
                    } else if (isFalseSelected) {
                        btnTrue.click(); // Đang Sai -> Bấm lần 3 lật lại ĐÚNG
                    }
                }
            }
        } 
        // --- XỬ LÝ CÂU TRẮC NGHIỆM THƯỜNG ---
        else if (q.type !== "short-answer" && q.type !== "reading-cluster" && q.type !== "writing") {
            const options = document.querySelectorAll('.option-btn');
            if (options[index] && !options[index].disabled) options[index].click();
        }
        return;
    }

    // 3. Phím Mũi tên (Dành riêng cho Kiểm Tra)
    if (isTestMode) {
        if (event.key === 'ArrowRight' && currentQuestionIndex < currentQuizQuestions.length - 1) { currentQuestionIndex++; renderQuestion(); }
        if (event.key === 'ArrowLeft' && currentQuestionIndex > 0) { currentQuestionIndex--; renderQuestion(); }
    }
});

const rawTextArea = document.getElementById('raw-text');
if (rawTextArea) {
    rawTextArea.addEventListener('paste', function(e) {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items; let imageItem = null;
        for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') === 0) { imageItem = items[i]; break; } }
        if (!imageItem) return; e.preventDefault(); 
        if (IMGBB_API_KEY === 'DÁN_API_KEY_CỦA_BẠN_VÀO_ĐÂY' || IMGBB_API_KEY.trim() === '') { alert("Bạn chưa thiết lập IMGBB API KEY để sử dụng tính năng dán ảnh tự động!"); return; }
        const file = imageItem.getAsFile(); const formData = new FormData(); formData.append('image', file);
        const cursorPos = this.selectionStart; const textBefore = this.value.substring(0, cursorPos); const textAfter = this.value.substring(this.selectionEnd, this.value.length);
        const placeholder = "\n[Đang tải ảnh lên mây... ⏳]\n";
        this.value = textBefore + placeholder + textAfter; this.selectionStart = this.selectionEnd = cursorPos + placeholder.length;
        fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData })
        .then(response => response.json())
        .then(data => { if (data.success) { this.value = this.value.replace(placeholder, `\n[IMG: ${data.data.url}]\n`); } else { this.value = this.value.replace(placeholder, "\n[Lỗi: ImgBB từ chối ảnh]\n"); } })
        .catch(error => { this.value = this.value.replace(placeholder, "\n[Lỗi: Mất kết nối mạng]\n"); });
    });
}

function toggleTheme() {
    // Đổi logic từ thêm class light-mode sang dark-mode
    document.body.classList.toggle('dark-mode');
    
    // Lưu trạng thái vào localStorage
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Chạy hàm này khi load trang để giữ nguyên theme người dùng đã chọn
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    // Nếu trước đó người dùng chọn dark thì bật dark-mode, còn không thì mặc định là sáng (ko làm gì cả)
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }
}
loadSavedTheme();

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('studyTheme');
    // NẾU CHƯA LƯU HOẶC LƯU LÀ LIGHT -> BẬT LIGHT MODE (MẶC ĐỊNH)
    if (savedTheme !== 'dark') { 
        document.body.classList.add('light-mode'); 
        const btn = document.getElementById('theme-btn'); 
        if (btn) btn.innerText = '🌙'; 
        localStorage.setItem('studyTheme', 'light');
    }
});

/* ==========================================
   10. QUẢN LÝ TỪ VỰNG & GAME TỪ VỰNG
========================================== */
function openVocabManage() {
    const password = prompt("🔒 Tính năng dành cho Giáo viên!\nVui lòng nhập mật khẩu để quản lý từ vựng:");
    if (password !== "000000") { if (password !== null) alert("❌ Sai mật khẩu!"); return; }
    showScreen('screen-vocab-manage'); document.getElementById('app-title').innerText = "Quản Lý Từ Vựng";
    isVocabBulkDeleteMode = false; document.getElementById('btn-confirm-bulk').classList.add('hidden'); renderVocabList();
}

function saveNewVocab() {
    const topic = document.getElementById('vocab-topic-input').value.trim() || 'Chung';
    const passInput = document.getElementById('vocab-topic-pass') ? document.getElementById('vocab-topic-pass').value.trim() : '0';
    
    if (!db.TopicPasswords) db.TopicPasswords = {};
    
    if (db.TopicPasswords[topic] && db.TopicPasswords[topic] !== '0') {
        if (passInput !== db.TopicPasswords[topic]) {
            alert(`❌ Bộ vocab "${topic}" là của người khác. Mật khẩu không khớp!`);
            return;
        }
    } else {
        db.TopicPasswords[topic] = passInput || '0';
    }

    let level = document.getElementById('vocab-level-input').value;
    let type = document.getElementById('vocab-type-input').value;
    let lang = document.getElementById('vocab-lang-input').value; // <-- THÊM DÒNG NÀY ĐỂ ĐỌC NGÔN NGỮ ĐƯỢC CHỌN
    let en = document.getElementById('vocab-en-input').value.trim();
    let vi = document.getElementById('vocab-vi-input').value.trim();
    let ipa = document.getElementById('vocab-ipa-input').value.trim();
    let pos = document.getElementById('vocab-pos-input').value.trim();
    let syn = document.getElementById('vocab-syn-input').value.trim();
    let ant = document.getElementById('vocab-ant-input') ? document.getElementById('vocab-ant-input').value.trim() : '';
    let note = document.getElementById('vocab-note-input') ? document.getElementById('vocab-note-input').value.trim() : ''; 

    if (!en || !vi) { alert("⚠️ Vui lòng nhập ít nhất Tiếng Anh và Tiếng Việt!"); return; }

    db.Vocabulary.unshift({ 
        id: Date.now().toString(),
        level: level === 'None' ? '' : level,
        type: type, 
        lang: lang, // <-- GHI NHẬN BIẾN NGÔN NGỮ VÀO ĐỐI TƯỢNG TỪ VỰNG
        topic: topic, 
        en: en, 
        ipa: ipa, 
        pos: pos ? `(${pos})` : '', 
        vi: vi, 
        syn: syn, 
        ant: ant,
        note: note,
        correctCount: 0, 
        wrongCount: 0,
        lastPlayed: Date.now()
    });

    localStorage.setItem('myStudyData', JSON.stringify(db));

    // Xóa trắng form để người dùng nhập tiếp từ khác (Giữ lại chủ đề)
    document.getElementById('vocab-en-input').value = "";
    document.getElementById('vocab-vi-input').value = "";
    document.getElementById('vocab-ipa-input').value = "";
    document.getElementById('vocab-pos-input').value = "";
    document.getElementById('vocab-syn-input').value = "";
    if (document.getElementById('vocab-ant-input')) document.getElementById('vocab-ant-input').value = "";
    if (document.getElementById('vocab-note-input')) document.getElementById('vocab-note-input').value = ""; // [MỚI]

    if (typeof renderVocabList === 'function') renderVocabList();
    
    // Hiệu ứng nút bấm thành công
    const btn = document.querySelector('button[onclick="saveNewVocab()"]');
    const oldText = btn.innerHTML;
    btn.innerHTML = "✅ Đã thêm vào kho!";
    btn.style.background = "var(--success)";
    setTimeout(() => { btn.innerHTML = oldText; btn.style.background = ""; }, 1500);
}

let draggedVocabIndex = -1;
function handleVocabDragStart(e, index) { draggedVocabIndex = index; e.dataTransfer.effectAllowed = "move"; setTimeout(() => e.target.classList.add('dragging'), 0); }
function handleVocabDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
function handleVocabDrop(e, targetIndex) {
    e.preventDefault(); if (draggedVocabIndex === targetIndex || draggedVocabIndex === -1) return;
    const movedItem = db.Vocabulary.splice(draggedVocabIndex, 1)[0];
    db.Vocabulary.splice(targetIndex, 0, movedItem); localStorage.setItem('myStudyData', JSON.stringify(db)); renderVocabList();
}
function handleVocabDragEnd(e) { e.target.classList.remove('dragging'); draggedVocabIndex = -1; }

let isVocabBulkDeleteMode = false;
function toggleVocabBulkDelete() {
    isVocabBulkDeleteMode = !isVocabBulkDeleteMode; const btnConfirm = document.getElementById('btn-confirm-bulk');
    if (isVocabBulkDeleteMode) { btnConfirm.classList.remove('hidden'); document.getElementById('btn-toggle-bulk').innerText = "Hủy chọn"; } 
    else { btnConfirm.classList.add('hidden'); document.getElementById('btn-toggle-bulk').innerText = "🗑 Chọn nhiều"; } renderVocabList();
}

function renderVocabList() {
    const listDiv = document.getElementById('vocab-manage-list'); 
    listDiv.innerHTML = ""; 
    document.getElementById('vocab-total-count').innerText = db.Vocabulary.length;
    
    if (db.Vocabulary.length === 0) { 
        listDiv.innerHTML = "<p style='text-align:center; color: var(--text-muted);'>Kho từ vựng đang trống. Hãy thêm từ mới nhé!</p>"; 
        return; 
    } 
    
    db.Vocabulary.forEach((item, index) => {
        const div = document.createElement('div'); 
        div.className = 'vocab-item-row drag-item'; 
        div.draggable = !isVocabBulkDeleteMode;
        
        // Gắn thuộc tính data-topic để hàm lọc có thể tìm và ẩn/hiện đúng chủ đề
        div.setAttribute('data-topic', item.topic || 'Chung'); 

        div.ondragstart = (e) => handleVocabDragStart(e, index); 
        div.ondragover = (e) => handleVocabDragOver(e); 
        div.ondrop = (e) => handleVocabDrop(e, index); 
        div.ondragend = (e) => handleVocabDragEnd(e);
        
        // Bổ sung margin-bottom: 10px để các thẻ từ vựng không bị dính sát vào nhau
        div.style.cssText = "background: var(--card-bg); padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color); margin-bottom: 10px;";
        
        let checkboxHTML = isVocabBulkDeleteMode ? `<input type="checkbox" class="vocab-checkbox" value="${index}" style="width: 20px; height: 20px; margin-right: 15px; cursor: pointer; accent-color: var(--danger);">` : '';
        
        div.innerHTML = `<div style="display: flex; align-items: center;">${checkboxHTML}<div style="cursor: grab; margin-right: 15px; font-size: 20px; color: var(--text-muted);" title="Kéo thả để sắp xếp">☰</div>
        <div><strong style="color: var(--primary); font-size: 18px;">${item.en}</strong> <span style="font-size:13px; color:var(--text-muted); margin-left:5px;">${item.type === 'structure' ? '[Cấu trúc]' : item.pos + ' ' + item.ipa}</span>
        <span style="background:var(--primary); color:#fff; padding:2px 6px; border-radius:4px; font-size:11px; margin-left:5px; font-weight:bold;">${item.topic || 'Chung'}</span>
        <div style="margin-top: 5px; font-size: 15px;">${item.vi}</div>
        ${item.syn ? `<div style="font-size: 13px; color: #10b981; margin-top:3px;">Đồng nghĩa: ${item.syn}</div>` : ''}
        ${item.note ? `<div style="font-size: 13px; color: #6b7280; margin-top:3px; font-style: italic;">💡 Ghi chú: ${item.note}</div>` : ''}
        </div></div>
        <button class="btn btn-danger btn-sm" onclick="deleteVocab(${index})">Xóa</button>`;
        
        listDiv.appendChild(div);
    });

    // Tự động làm mới Menu lọc sau khi danh sách thay đổi (thêm, xóa, sửa từ vựng)
    if (typeof updateManageTopicDropdown === 'function') {
        updateManageTopicDropdown();
        filterVocabTable();
    }
}

function deleteVocab(index) { if(confirm("Bạn có chắc muốn xóa từ này khỏi kho không?")) { db.Vocabulary.splice(index, 1); localStorage.setItem('myStudyData', JSON.stringify(db)); renderVocabList(); } }
function deleteSelectedVocabs() {
    const checkboxes = document.querySelectorAll('.vocab-checkbox:checked'); if(checkboxes.length === 0) { alert("Chưa có từ nào được chọn!"); return; }
    if(confirm(`Bạn có chắc chắn muốn xóa ${checkboxes.length} từ đã chọn?`)) { let indices = Array.from(checkboxes).map(cb => parseInt(cb.value)).sort((a,b) => b - a); indices.forEach(idx => db.Vocabulary.splice(idx, 1)); localStorage.setItem('myStudyData', JSON.stringify(db)); toggleVocabBulkDelete(); }
}
function deleteAllVocabs() { if(confirm("⚠️ NGUY HIỂM: Bạn có chắc chắn muốn XÓA SẠCH toàn bộ kho từ vựng không? Hành động này không thể hoàn tác!")) { db.Vocabulary = []; localStorage.setItem('myStudyData', JSON.stringify(db)); renderVocabList(); } }

function saveBulkVocab() {
    const inputData = document.getElementById('vocab-bulk-input').value.trim();
    if (!inputData) {
        alert("⚠️ Vui lòng dán dữ liệu vào ô trống!");
        return;
    }
    let lang = document.getElementById('vocab-lang-input').value;

    const lines = inputData.split('\n');
    let successCount = 0;
    
    // Đảm bảo kho lưu pass tồn tại
    if (!db.TopicPasswords) db.TopicPasswords = {};
    
    // Lấy mật khẩu mặc định từ ô nhập Mật khẩu bên trên (để gán cho các chủ đề mới tinh)
    const defaultPassInput = document.getElementById('vocab-topic-pass');
    const defaultPass = defaultPassInput ? defaultPassInput.value.trim() : '0';

    // --- BƯỚC 1: QUÉT TRƯỚC ĐỂ TÌM DANH SÁCH CHỦ ĐỀ SẼ IMPORT ---
    let uniqueTopics = new Set();
    let parsedWords = [];

    for (let line of lines) {
        if (!line.trim()) continue;
        let cols = line.split('\t').map(c => c.trim());
        
        // Chỉ xử lý nếu dòng có ít nhất 5 cột (đảm bảo đủ Anh - Việt và Chủ đề)
        if (cols.length >= 5) { 
            let topic = cols[2] || 'Chung';
            uniqueTopics.add(topic);
            parsedWords.push(cols);
        }
    }

    if (parsedWords.length === 0) {
        alert("❌ Dữ liệu không hợp lệ. Vui lòng đảm bảo copy đúng bảng từ AI (ngăn cách bằng phím Tab).");
        return;
    }

    // --- BƯỚC 2: KIỂM TRA AN NINH TỪNG CHỦ ĐỀ ---
    for (let topic of uniqueTopics) {
        // Nếu chủ đề đã có pass và pass khác 0
        if (db.TopicPasswords[topic] && db.TopicPasswords[topic] !== '0') {
            let entered = prompt(`🔒 BẢO MẬT: Nhập mật khẩu cho chủ đề "${topic}" để thêm từ hàng loạt:`);
            if (entered !== db.TopicPasswords[topic]) {
                alert(`❌ Sai mật khẩu chủ đề "${topic}". Đã hủy toàn bộ quá trình nhập!`);
                return; // Chặn đứng, không cho import bất kỳ từ nào
            }
        } else if (!db.TopicPasswords[topic]) {
            // Nếu là chủ đề mới -> tự động gán pass bằng với ô Mật khẩu bạn đang nhập trên màn hình
            db.TopicPasswords[topic] = defaultPass || '0'; 
        }
    }

    // --- BƯỚC 3: XỬ LÝ LƯU DỮ LIỆU ---
    parsedWords.forEach(cols => {
        let level = cols[0] === '-' ? '' : cols[0];
        let type = (cols[1] === 'word' || cols[1] === 'phrase' || cols[1] === 'collo' || cols[1] === 'structure') ? cols[1] : 'word';
        let topic = cols[2];
        let en = cols[3];
        let vi = cols[4];
        let ipa = cols[5] === '-' ? '' : cols[5];
        let pos = cols[6] === '-' ? '' : cols[6];
        
        // Đã tách riêng rẽ Đồng nghĩa (Cột 8), Trái nghĩa (Cột 9) và Ghi chú (Cột 10)
        let syn = cols[7] && cols[7] !== '-' ? cols[7].trim() : '';
        let ant = cols[8] && cols[8] !== '-' ? cols[8].trim() : '';
        let note = cols[9] && cols[9] !== '-' ? cols[9].trim() : '';

        db.Vocabulary.unshift({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5), // Tạo ID duy nhất tránh trùng lặp
            level: level,
            type: type,
            lang: lang,
            topic: topic,
            en: en,
            ipa: ipa,
            pos: pos ? `(${pos})` : '',
            vi: vi,
            syn: syn,
            ant: ant,
            correctCount: 0,
            wrongCount: 0,
            lastPlayed: Date.now()
        });
        successCount++;
    });

    // Lưu vào bộ nhớ cục bộ
    localStorage.setItem('myStudyData', JSON.stringify(db));
    
    // Xóa trắng ô nhập liệu
    document.getElementById('vocab-bulk-input').value = '';
    alert(`🎉 Đã thêm thành công ${successCount} từ vựng!`);
    
    // Cập nhật lại giao diện
    if (typeof renderVocabList === 'function') renderVocabList();
}

let playingVocabPool = []; let vScore = 0, vStreak = 0, vMaxStreak = 0, vLives = 5; let vCurrentQuestion = null; let currentVocabTopic = "";

async function fetchVocabRanking(topic) {
    try {
        const response = await fetch(CLOUD_API_URL, {
            method: 'POST',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: 'get_ranking', topic: topic })
        });
        const ranking = await response.json();
        return ranking;
    } catch (error) {
        console.log("Lỗi lấy ranking:", error);
        return [];
    }
}

async function displayVocabRanking(topic) {
    const container = document.getElementById('vocab-rankings');
    if (!container) return;
    const ranking = await fetchVocabRanking(topic);
    if (ranking.length === 0) {
        container.innerHTML = `✨ Chưa có kỷ lục cho chủ đề "${topic}". Hãy là người đầu tiên! ✨`;
        container.classList.remove('hidden');
        return;
    }
    const top3 = ranking.slice(0, 3);
    let html = `<strong>🏆 Bảng xếp hạng - ${topic}</strong><br>
                <table style="width:100%; margin-top:8px; border-collapse:collapse; background: var(--card-bg); border-radius: 10px; overflow: hidden;">
                    <thead>
                        <tr style="background: var(--primary); color: #fff;">
                            <th style="padding: 8px; text-align: center; width: 15%;">Hạng</th>
                            <th style="padding: 8px; text-align: left; width: 45%;">Tên</th>
                            <th style="padding: 8px; text-align: center; width: 20%;">Điểm</th>
                            <th style="padding: 8px; text-align: center; width: 20%;">Streak</th>
                        </tr>
                    </thead>
                    <tbody>`;
    top3.forEach((item, idx) => {
        const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : '🥉');
        html += `<tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 6px; text-align: center; font-weight: bold;">${medal} ${idx+1}</td>
                    <td style="padding: 6px;">${escapeHtml(item.playerName)}</td>
                    <td style="padding: 6px; text-align: center;">${item.topScore}</td>
                    <td style="padding: 6px; text-align: center;">${item.topStreak}</td>
                 </tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
    container.classList.remove('hidden');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

async function updateVocabRanking(topic, score, streak) {
    const playerName = localStorage.getItem('studentName') || 'Học sinh';
    try {
        const response = await fetch(CLOUD_API_URL, {
            method: 'POST',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: 'update_ranking', topic: topic, playerName: playerName, score: score, streak: streak })
        });
        const result = await response.json();
        if (result.updated) {
            alert(`🎉 ${result.message}`);
            displayVocabRanking(topic);
        } else {
            alert(`😢 ${result.message}`);
        }
    } catch (error) {
        console.log("Lỗi cập nhật ranking:", error);
    }
}

// 1. Mở màn hình Game: Nạp trạng thái đã lưu vào các nút gạt
function openVocabGame() {
    // [TỰ ĐỘNG DỌN RÁC] Sửa lỗi văng game do từ vựng bị hỏng [object HTML...]
    if (db && db.Vocabulary) {
        db.Vocabulary = db.Vocabulary.filter(v => 
            v && 
            typeof v === 'object' && 
            typeof v.en === 'string' && 
            typeof v.vi === 'string' && 
            !v.en.includes('[object') && 
            !v.vi.includes('[object')
        );
        
        // --- ĐOẠN ĐƯỢC FIX LỖI CHO IPHONE TẠI ĐÂY ---
        try {
            localStorage.setItem('myStudyData', JSON.stringify(db));
        } catch(e) {
            console.log("iPhone chặn ghi LocalStorage, bỏ qua bước lưu rác.");
        }
        // ------------------------------------------
    }

    if (!db || !db.Vocabulary || db.Vocabulary.length < 4) { 
        alert("⚠️ Kho từ vựng cần ít nhất 4 từ hợp lệ!"); return; 
    }
    showScreen('screen-vocab-game'); 
    
    const appTitle = document.getElementById('app-title');
    if (appTitle) appTitle.innerText = "Game Từ Vựng";

    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav && !isIsolatedMode) bottomNav.classList.remove('hide-nav');
    
    // --- LẤY LẠI SỐ LIỆU CHO Ô MÀU TÍM (Dropdown chủ đề) ---
    const topics = [...new Set(db.Vocabulary.map(item => item.topic || 'Uncategorized'))];
    const select = document.getElementById('vocab-topic-select');
    if (select) {
        select.innerHTML = '<option value="ALL">Tất cả chủ đề</option>';
        topics.forEach(t => select.innerHTML += `<option value="${t}">${t}</option>`);
    }
    
    // [ĐÃ FIX LỖI NULL TRÊN HTML] Khớp ID với giao diện Bento Box
    const wordCountEl = document.getElementById('bento-total-words'); 
    if (wordCountEl) wordCountEl.innerText = db.Vocabulary.length;
    
    const topicCountEl = document.getElementById('bento-total-topics');
    if (topicCountEl) topicCountEl.innerText = topics.length;

    // Lấy kỷ lục điểm & streak hiển thị lên Bento
    let records = { maxScore: 0, maxStreak: 0 };
    try {
        records = JSON.parse(localStorage.getItem('vocabRecords')) || { maxScore: 0, maxStreak: 0 };
    } catch(e) {} // Bọc thêm try catch đọc kỷ lục cho an toàn
    
    const maxScoreEl = document.getElementById('bento-max-score');
    const maxStreakEl = document.getElementById('bento-max-streak');
    if (maxScoreEl) maxScoreEl.innerText = records.maxScore;
    if (maxStreakEl) maxStreakEl.innerText = records.maxStreak;
    
    // Hiển thị màn hình sảnh, giấu các màn hình khác
    document.getElementById('vocab-start-menu').classList.remove('hidden');
    document.getElementById('vocab-game-play-area').classList.add('hidden');
    document.getElementById('vocab-game-over').classList.add('hidden');
}

// 2. Bắt đầu Game: Đọc các nút gạt và áp dụng vào game
function startVocabGame() {
    const selectEl = document.getElementById('vocab-topic-select');
    const selectedTopic = selectEl ? selectEl.value : 'ALL';
    
    // [ĐÃ FIX] Tránh lỗi văng app khi không tìm thấy nút gạt (Cannot read properties of null)
    const ttsCheckbox = document.getElementById('start-set-tts');
    const timerCheckbox = document.getElementById('start-set-timer');
    const effectsCheckbox = document.getElementById('start-set-effects');
    
    // Mặc kệ vạch đỏ của phần mềm (nếu có), trình duyệt vẫn hiểu và chạy đúng!
    vSettings.autoTTS = ttsCheckbox ? ttsCheckbox.checked : false;
    vSettings.timer = timerCheckbox ? timerCheckbox.checked : true;
    vSettings.effects = effectsCheckbox ? effectsCheckbox.checked : true;
    
    // --- ĐOẠN ĐƯỢC FIX LỖI CHO IPHONE TẠI ĐÂY ---
    try {
        localStorage.setItem('vocabSettings', JSON.stringify(vSettings));
    } catch(e) {
        console.log("iPhone chặn ghi cài đặt game.");
    }
    // ------------------------------------------

    currentVocabTopic = selectedTopic;
    playingVocabPool = selectedTopic === 'ALL' ? db.Vocabulary : db.Vocabulary.filter(v => (v.topic || 'Chung') === selectedTopic);
    
    if (playingVocabPool.length < 4) { 
        alert(`⚠️ Chủ đề này không đủ từ vựng hợp lệ!`); return; 
    }

    document.getElementById('vocab-start-menu').classList.add('hidden');
    document.getElementById('vocab-game-play-area').classList.remove('hidden');
    document.getElementById('vocab-game-over').classList.add('hidden');
    
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) bottomNav.classList.add('hide-nav');

    vScore = 0; vStreak = 0; vMaxStreak = 0; vLives = 5; 
    updateVocabUI();
    
    if (selectedTopic !== 'ALL') {
        if (typeof displayVocabRanking === 'function') displayVocabRanking(selectedTopic);
    } else {
        const rankingBox = document.getElementById('vocab-rankings');
        if (rankingBox) rankingBox.classList.add('hidden');
    }

    generateVocabQuestion();
}

function initVocabGame() { startVocabGame(); }

/* ==========================================
   HÀM THOÁT GAME TỪ VỰNG (MỚI)
========================================== */
function exitVocabGame() {
    if (confirm("Bạn có chắc chắn muốn dừng chơi? Điểm và kỷ lục hiện tại của bạn vẫn sẽ được lưu lại.")) {
        if (typeof vTimerAnimation !== 'undefined') cancelAnimationFrame(vTimerAnimation);
        
        // [MỚI] LƯU KỶ LỤC TRƯỚC KHI THOÁT
        if (vScore > 0 || vMaxStreak > 0) {
            if (currentVocabTopic !== 'ALL') updateVocabRanking(currentVocabTopic, vScore, vMaxStreak);
            
            // [FIX LỖI IPHONE]: Bọc an toàn toàn bộ quá trình đọc/ghi kỷ lục
            try {
                let records = JSON.parse(localStorage.getItem('vocabRecords')) || { maxScore: 0, maxStreak: 0 };
                if (vScore > records.maxScore) records.maxScore = vScore;
                if (vMaxStreak > records.maxStreak) records.maxStreak = vMaxStreak;
                localStorage.setItem('vocabRecords', JSON.stringify(records));
            } catch (e) {
                console.log("Safari ẩn danh chặn lưu kỷ lục lúc thoát.");
            }
        }
        
        if (isIsolatedMode) {
            // Nếu là học sinh truy cập qua Link Share -> Khóa cửa sổ
            document.body.innerHTML = "<div style='display:flex; flex-direction:column; gap: 15px; height:100vh; align-items:center; justify-content:center; background:var(--bg-main); color:var(--primary); font-size:24px; font-weight:bold; text-align:center; padding: 20px;'>🎓<br>Dữ liệu đã được ghi nhận.<br>Em có thể đóng cửa sổ này!</div>";
        } else {
            // Bình thường -> Về sảnh từ vựng
            openVocabGame(); 
        }
    }
}

function updateVocabUI() {
    const scoreEl = document.getElementById('vocab-score');
    const streakEl = document.getElementById('vocab-streak');
    const livesEl = document.getElementById('vocab-lives');
    
    if (scoreEl) scoreEl.innerText = vScore; 
    if (streakEl) streakEl.innerText = vStreak;
    if (livesEl) {
        let hearts = ""; 
        for(let i=0; i<5; i++) hearts += i < vLives ? "❤️" : "🖤"; 
        livesEl.innerText = hearts;
    }

    // [MỚI] Tự động chèn nút Thoát vào giao diện Game nếu chưa có
    let playArea = document.getElementById('vocab-game-play-area');
    if (playArea && !document.getElementById('vocab-exit-btn')) {
        const exitBtn = document.createElement('button');
        exitBtn.id = 'vocab-exit-btn';
        exitBtn.className = 'btn btn-secondary btn-sm';
        exitBtn.innerHTML = '&#8592; Thoát Game';
        exitBtn.style.cssText = 'margin-bottom: 15px; border-color: var(--danger); color: var(--danger); font-weight: bold; padding: 8px 15px; border-radius: 8px;';
        exitBtn.onclick = exitVocabGame;
        playArea.insertBefore(exitBtn, playArea.firstChild);
    }

    // [MỚI] Ép buộc tàng hình thanh Bottom Nav bằng !important để đánh bại CSS
    // Đã chuyển sang dùng class hide-nav cho mượt
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) bottomNav.classList.add('hide-nav');
}

function getRandomItems(arr, count, excludeItem) { let filtered = arr.filter(item => item !== excludeItem); return filtered.sort(() => Math.random() - 0.5).slice(0, count); }

// Biến toàn cục cho Game & Cài đặt
let vQuestionStartTime = 0;
let vTimerAnimation = null;
let vSettings = JSON.parse(localStorage.getItem('vocabSettings')) || {
    autoTTS: false,
    timer: true,
    effects: true
};

// ==========================================
// 1. HÀM TẠO BẢNG CÀI ĐẶT (SETTINGS MODAL)
// ==========================================
function showVocabSettings() {
    const overlay = document.createElement('div');
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:999999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(5px);";
    
    const box = document.createElement('div');
    box.style.cssText = "background:var(--card-bg); padding:25px; border-radius:16px; border:1px solid var(--border-color); width:90%; max-width:350px; text-align:left; animation: fadeInUp 0.3s ease;";
    
    box.innerHTML = `
        <h3 style="margin-top:0; color:var(--text-main); font-size:20px; text-align:center; margin-bottom: 20px;">⚙️ Tùy chọn Trải nghiệm</h3>
        
        <div class="setting-row">
            <span style="color:var(--text-main); font-weight:500;">🔊 Tự động đọc từ (TTS)</span>
            <label class="toggle-switch">
                <input type="checkbox" id="set-tts" ${vSettings.autoTTS ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
        
        <div class="setting-row">
            <span style="color:var(--text-main); font-weight:500;">⏱️ Áp lực thời gian (Tính giờ)</span>
            <label class="toggle-switch">
                <input type="checkbox" id="set-timer" ${vSettings.timer ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>

        <div class="setting-row">
            <span style="color:var(--text-main); font-weight:500;">✨ Hiệu ứng & Âm thanh</span>
            <label class="toggle-switch">
                <input type="checkbox" id="set-effects" ${vSettings.effects ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>

        <button class="btn btn-primary" style="width:100%; justify-content:center; margin-top:20px; padding:12px;" id="btn-save-settings">Xong</button>
    `;
    
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    document.getElementById('btn-save-settings').onclick = () => {
        vSettings.autoTTS = document.getElementById('set-tts').checked;
        vSettings.timer = document.getElementById('set-timer').checked;
        vSettings.effects = document.getElementById('set-effects').checked;
        
        localStorage.setItem('vocabSettings', JSON.stringify(vSettings)); // Lưu lại
        document.body.removeChild(overlay);
        
        // Ẩn/hiện thanh thời gian ngay lập tức theo cài đặt
        const timerContainer = document.querySelector('.vocab-timer-container');
        if(timerContainer) timerContainer.style.display = vSettings.timer ? 'block' : 'none';
    };
}

// ==========================================
// 2. HÀM TẠO CÂU HỎI (Áp dụng Tùy chọn)
// ==========================================
function generateVocabQuestion() {
    if (playingVocabPool.length < 4) { alert("Cần ít nhất 4 từ vựng để chơi!"); return; } // Sửa lỗi lấy dữ liệu
    
    // Tự động tạo câu hỏi ngẫu nhiên như cũ
    document.getElementById('vocab-explanation').classList.add('hidden'); 
    document.getElementById('vocab-options-container').style.pointerEvents = 'auto';
    
    let type, targetItem, questionText, correctAnswer, optionsArr, hint; let valid = false;
    
    // [ĐÃ FIX]: Gom tất cả từ đơn, cụm từ (phrase) và collocations vào chung để tạo câu hỏi
    const words = playingVocabPool.filter(v => v.type !== 'structure'); 
    const structures = playingVocabPool.filter(v => v.type === 'structure');
    const hasSyn = words.some(w => w.syn && w.syn !== '-'); 
    const hasAnt = words.some(w => w.ant && w.ant !== '-');
    
    // [MỚI]: Đánh hơi xem trong kho có từ nào dùng ngoặc vuông [...] không
    const clozeItems = playingVocabPool.filter(v => /\[.*?\]/.test(v.en));
    const hasCloze = clozeItems.length > 0;

    let attempts = 0;
    while (!valid && attempts < 100) {
        attempts++; let rand = Math.random();
        
        // [MỚI]: Phân bổ lại tỉ lệ, dành 25% ra dạng đục lỗ nếu kho có data
        if (rand < 0.25) type = 'en_vi'; 
        else if (rand < 0.45) type = 'vi_en'; 
        else if (rand < 0.65 && hasCloze) type = 'fill_blank'; 
        else if (rand < 0.75 && hasSyn) type = 'synonym'; 
        else if (rand < 0.85 && hasAnt) type = 'antonym'; 
        else if (structures.length > 0) type = 'structure'; 
        else type = 'en_vi'; 
        
        // 1. NẾU QUAY TRÚNG DẠNG ĐỤC LỖ (ĐIỀN TỪ)
        if (type === 'fill_blank' && hasCloze) {
            targetItem = getSmartRandomWord(clozeItems);
            let matchBlank = targetItem.en.match(/\[(.*?)\]/);
            correctAnswer = matchBlank[1].trim(); // Đáp án đúng là chữ trong ngoặc
            
            // Hiện câu hỏi: depend _______ (Nghĩa: phụ thuộc vào)
            questionText = `Điền từ:\n"${targetItem.en.replace(/\[.*?\]/, '_______')}"\n(Nghĩa: ${targetItem.vi})`; 
            
            optionsArr = [correctAnswer];
            const prepPool = ['in', 'on', 'at', 'about', 'for', 'with', 'to', 'of', 'from', 'up', 'down', 'by', 'into', 'over', 'out', 'off', 'away'];
            
            // Thuật toán nhiễu thông minh (Giới từ vs Từ thường)
            if (prepPool.includes(correctAnswer.toLowerCase())) {
                let available = prepPool.filter(p => p !== correctAnswer.toLowerCase());
                available.sort(() => 0.5 - Math.random());
                optionsArr.push(...available.slice(0, 3));
            } else {
                let otherWords = playingVocabPool.filter(w => w !== targetItem).map(w => w.en.replace(/\[|\]/g, '').trim());
                otherWords.sort(() => 0.5 - Math.random());
                optionsArr.push(...otherWords.slice(0, 3));
            }
            hint = "ĐIỀN TỪ"; valid = true;
        } 
        // 2. NẾU LÀ CẤU TRÚC
        else if (type === 'structure' && structures.length > 0) {
            targetItem = getSmartRandomWord(structures); 
            questionText = `Cấu trúc nào có nghĩa là: "${targetItem.vi}"?`; 
            correctAnswer = targetItem.en.replace(/\[|\]/g, ''); // [FIX] Xóa ngoặc vuông
            let pool = structures.length >= 4 ? structures : playingVocabPool; 
            optionsArr = [correctAnswer, ...getRandomItems(pool, 3, targetItem).map(i => i.en.replace(/\[|\]/g, ''))]; 
            hint = "CẤU TRÚC"; valid = true;
        } 
        // 3. CÁC DẠNG CÒN LẠI (TỪ VỰNG BÌNH THƯỜNG)
        else if (words.length > 0) {
            let validWords = words; 
            if (type === 'synonym') validWords = words.filter(w => w.syn && w.syn !== '-'); 
            if (type === 'antonym') validWords = words.filter(w => w.ant && w.ant !== '-'); 
            if (validWords.length === 0) { type = 'en_vi'; validWords = words; }
            targetItem = getSmartRandomWord(validWords);
            
            // [FIX] Thêm hàm .replace(/\[|\]/g, '') vào tất cả biến hiển thị để giấu dấu ngoặc vuông nếu có
            if (type === 'en_vi') { 
                questionText = `Nghĩa của từ "${targetItem.en.replace(/\[|\]/g, '')}" ${targetItem.pos} là gì?`; 
                correctAnswer = targetItem.vi; 
                optionsArr = [correctAnswer, ...getRandomItems(playingVocabPool, 3, targetItem).map(i => i.vi)]; 
                hint = "TỪ VỰNG"; valid = true; 
            } 
            else if (type === 'vi_en') { 
                questionText = `Từ nào có nghĩa là: "${targetItem.vi}"?`; 
                correctAnswer = targetItem.en.replace(/\[|\]/g, ''); 
                optionsArr = [correctAnswer, ...getRandomItems(playingVocabPool, 3, targetItem).map(i => i.en.replace(/\[|\]/g, ''))]; 
                hint = "TỪ VỰNG"; valid = true; 
            } 
            else if (type === 'synonym' && targetItem.syn) { 
                questionText = `Từ nào ĐỒNG NGHĨA (Synonym) với "${targetItem.en.replace(/\[|\]/g, '')}"?`; 
                let syns = targetItem.syn.split(','); 
                let chosenSyn = syns[Math.floor(Math.random() * syns.length)].trim();
                correctAnswer = chosenSyn.includes(':') ? chosenSyn.split(':')[0].trim() : chosenSyn; 
                targetItem.tempExtraVi = chosenSyn.includes(':') ? chosenSyn.split(':')[1].trim() : "???";
                optionsArr = [correctAnswer, ...getRandomItems(playingVocabPool, 3, targetItem).map(i => i.en.replace(/\[|\]/g, ''))]; 
                hint = "ĐỒNG NGHĨA"; valid = true; 
            } 
            else if (type === 'antonym' && targetItem.ant) { 
                questionText = `Từ nào TRÁI NGHĨA (Antonym) với "${targetItem.en.replace(/\[|\]/g, '')}"?`; 
                let ants = targetItem.ant.split(','); 
                let chosenAnt = ants[Math.floor(Math.random() * ants.length)].trim();
                correctAnswer = chosenAnt.includes(':') ? chosenAnt.split(':')[0].trim() : chosenAnt; 
                targetItem.tempExtraVi = chosenAnt.includes(':') ? chosenAnt.split(':')[1].trim() : "???";
                optionsArr = [correctAnswer, ...getRandomItems(playingVocabPool, 3, targetItem).map(i => i.en.replace(/\[|\]/g, ''))]; 
                hint = "TRÁI NGHĨA"; valid = true; 
            }
        }
    }
    
    vCurrentQuestion = { item: targetItem, type, correct: correctAnswer }; 
    optionsArr = [...new Set(optionsArr)]; 
    while(optionsArr.length < 4) optionsArr.push("Đáp án " + Math.random().toString(36).substr(2,5)); 
    optionsArr.sort(() => Math.random() - 0.5); 
    
    document.getElementById('vocab-hint').innerText = hint; 
    document.getElementById('vocab-question-text').innerText = questionText;
    
    // --- KHÚC CHÈN NÚT CÀI ĐẶT VÀ THANH THỜI GIAN ---
    const cardEl = document.getElementById('vocab-question-card');
    cardEl.style.position = 'relative'; 
    
    if(!document.getElementById('vocab-settings-btn')) {
        cardEl.insertAdjacentHTML('afterbegin', `<button id="vocab-settings-btn" class="vocab-settings-btn" onclick="showVocabSettings()" title="Tùy chọn">⚙️</button>`);
    }

    let timerContainer = document.querySelector('.vocab-timer-container');
    if (!timerContainer) {
        cardEl.insertAdjacentHTML('afterbegin', `<div class="vocab-timer-container"><div class="vocab-timer-bar" id="vocab-timer"></div></div>`);
        timerContainer = document.querySelector('.vocab-timer-container');
    }
    timerContainer.style.display = vSettings.timer ? 'block' : 'none';

    cardEl.classList.remove('swipe-out', 'shake-animation');
    cardEl.classList.add('swipe-in');
    setTimeout(() => cardEl.classList.remove('swipe-in'), 400);

    const optsContainer = document.getElementById('vocab-options-container');
    optsContainer.innerHTML = '';
    
    optionsArr.slice(0, 4).forEach(opt => { 
        if(opt === '-' || opt === '') opt = "Đáp án khác";
        let btn = document.createElement('button'); btn.className = 'option-btn'; 
        btn.style.textAlign = 'center'; btn.style.fontWeight = 'bold'; btn.innerText = opt; 
        btn.onclick = function() { handleVocabAnswer(this, opt); }; 
        optsContainer.appendChild(btn); 
    });

   // Phát âm theo Tùy chọn (Hỗ trợ đa ngôn ngữ)
    if (vSettings.autoTTS && (type === 'en_vi' || type === 'fill_blank')) {
        try {
            window.speechSynthesis.cancel(); // Xóa giọng đọc cũ đang chờ (nếu có) để tránh bị lag
            // [MỚI] Loại bỏ hoàn toàn dấu ngoặc vuông khi AI đọc bài
            const msg = new SpeechSynthesisUtterance(targetItem.en.replace(/\[|\]/g, ''));
            
            // Đọc theo ngôn ngữ đã lưu của từ, nếu không có thì mặc định tiếng Anh
            msg.lang = targetItem.lang || 'en-US'; 
            msg.rate = 0.9;
            window.speechSynthesis.speak(msg);
        } catch(e) {}
    }

    // Đếm giờ theo Tùy chọn
    cancelAnimationFrame(vTimerAnimation);
    if (vSettings.timer) {
        vQuestionStartTime = Date.now();
        const timerBar = document.getElementById('vocab-timer');
        timerBar.style.width = '100%';
        timerBar.classList.remove('hurry');
        
        const updateTimer = () => {
            const percentage = Math.max(0, 100 - ((Date.now() - vQuestionStartTime) / 10000) * 100);
            timerBar.style.width = `${percentage}%`;
            if (percentage < 30) timerBar.classList.add('hurry');
            if (percentage > 0 && optsContainer.style.pointerEvents !== 'none') vTimerAnimation = requestAnimationFrame(updateTimer);
        };
        vTimerAnimation = requestAnimationFrame(updateTimer);
    }
}

// ==========================================
// 3. HÀM XỬ LÝ ĐÁP ÁN (Áp dụng Tùy chọn)
// ==========================================
function handleVocabAnswer(btnEl, selectedOpt) {
    const optsContainer = document.getElementById('vocab-options-container');
    
    // [ĐÃ FIX]: Ngăn chặn hack điểm bằng cách Spam phím Enter/Space
    if (optsContainer.style.pointerEvents === 'none') return; 
    optsContainer.style.pointerEvents = 'none';
    
    // Khóa tất cả các nút bấm và xóa vùng chọn (blur) để bàn phím không kích hoạt lại được
    optsContainer.querySelectorAll('.option-btn').forEach(b => { 
        b.disabled = true; 
        b.blur(); 
    });

    cancelAnimationFrame(vTimerAnimation);
    
    let isCorrect = selectedOpt === vCurrentQuestion.correct;
    const cardEl = document.getElementById('vocab-question-card');
    let currentItem = vCurrentQuestion.item;

    if (isCorrect) { 
        currentItem.correctCount = (currentItem.correctCount || 0) + 1;

        if (btnEl) btnEl.classList.add('correct-btn'); 
        vStreak++; 
        if (vStreak > vMaxStreak) vMaxStreak = vStreak; 

        // [ÁP DỤNG]: Đúng 5 câu liên tiếp mới được hồi 1 tim
        if (vStreak % 5 === 0 && vLives < 5) {
            vLives++;
            if (typeof showFloatingPoints === 'function' && btnEl) showFloatingPoints(btnEl, "+1 ❤️ Hồi máu");
        }
        
        let pointsEarned = 10;
        if (vSettings.timer) {
            const timeTaken = Date.now() - vQuestionStartTime;
            if (timeTaken < 3000) pointsEarned = 20;
            else if (timeTaken < 6000) pointsEarned = 15;
        }
        pointsEarned += Math.floor(vStreak / 3) * 5; 
        vScore += pointsEarned; 
        
        if (vSettings.effects) {
            if (typeof showFloatingPoints === 'function' && btnEl) showFloatingPoints(btnEl, pointsEarned);
            if (typeof playCorrectSound === 'function') playCorrectSound(); 
            if (vStreak >= 3) {
                cardEl.classList.add('fever-mode');
                if (vStreak % 5 === 0 && typeof triggerConfetti === 'function') triggerConfetti(); 
            }
        }

        updateVocabUI(); 
    } 
    else { 
        currentItem.wrongCount = (currentItem.wrongCount || 0) + 1;

        if (btnEl) {
            btnEl.classList.add('incorrect-btn'); 
        } else {
            const hintEl = document.getElementById('vocab-hint');
            if (hintEl) { hintEl.innerText = "⏰ HẾT GIỜ!"; hintEl.style.color = "var(--danger)"; }
        }

        document.querySelectorAll('#vocab-options-container .option-btn').forEach(b => { 
            if (b.innerText === vCurrentQuestion.correct) b.classList.add('correct-btn'); 
        }); 
        
        if (vSettings.effects) {
            if (typeof playErrorSound === 'function') playErrorSound();
            cardEl.classList.add('shake-animation');
        }

        vStreak = 0; vLives--; 
        cardEl.classList.remove('fever-mode'); 
        updateVocabUI(); 
    }

    currentItem.lastPlayed = Date.now();
    
    // Bọc try...catch để chặn lỗi văng game
    try {
        localStorage.setItem('myStudyData', JSON.stringify(db));
    } catch (e) {
        console.log("Safari ẩn danh chặn lưu điểm, tạm bỏ qua bước này!");
    }
    
    // GỌI BẢNG GIẢI THÍCH (Bất kể đúng hay sai)
    showVocabExplanation(isCorrect, btnEl === null);
}

function showVocabExplanation(isCorrect, isTimeout = false) {
    const expDiv = document.getElementById('vocab-explanation'); 
    const content = document.getElementById('vocab-explain-content'); 
    let item = vCurrentQuestion.item;
    
    // Xóa màn hình đen mờ cũ
    const oldOverlay = document.getElementById('vocab-exp-overlay');
    if (oldOverlay) oldOverlay.remove();

    // Tùy chỉnh màu sắc chuẩn Duolingo
    let bgColor = isCorrect ? "#d7ffb8" : "#ffdfe0"; 
    let borderColor = isCorrect ? "#58cc02" : "#ff4b4b"; 
    let titleColor = isCorrect ? "#58cc02" : "#ea2b2b";
    let titleText = isCorrect ? "Tuyệt vời!" : (isTimeout ? "Hết giờ!" : "Chưa chính xác!");
    
    let iconHtml = isCorrect 
        ? `<div style="background: white; color: #58cc02; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">✓</div>` 
        : `<div style="background: white; color: #ea2b2b; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">✗</div>`;

    // --- 1. PHÂN TÍCH TỪ GỐC (Chuẩn Sư Phạm) ---
    let ipaHtml = item.ipa ? `<span style="color: #666; font-size: 14px; font-weight: normal; font-family: monospace;">${item.ipa}</span>` : '';
    let posHtml = item.pos ? `<span style="color: #0284c7; font-size: 14px; font-weight: bold;">${item.pos}</span>` : '';
    let synHtml = item.syn && item.syn !== '-' ? `<div style="font-size: 13px; color: #047857; margin-top: 4px;"><strong>Đồng nghĩa:</strong> ${item.syn}</div>` : '';
    let antHtml = item.ant && item.ant !== '-' ? `<div style="font-size: 13px; color: #be123c; margin-top: 4px;"><strong>Trái nghĩa:</strong> ${item.ant}</div>` : '';
    let noteHtml = item.note ? `<div style="font-size: 13.5px; color: #555; margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(0,0,0,0.08); font-style: italic; line-height: 1.4;">💡 <strong>Ghi chú giáo viên:</strong> ${item.note}</div>` : '';

    // [MỚI - ĐÃ FIX]: Xử lý hiển thị ngoặc vuông cho đẹp
    let displayEn = item.en;
    if (vCurrentQuestion.type === 'fill_blank') {
        // Biến depend [on] thành depend on (on được gạch chân và tô xanh)
        displayEn = item.en.replace(/\[(.*?)\]/g, '<u style="color: #16a34a; font-weight: 900;">$1</u>');
    } else {
        // Xóa ngoặc vuông nếu đang chơi dạng thường (trắc nghiệm nghĩa)
        displayEn = item.en.replace(/\[|\]/g, '');
    }

    let mainWordHtml = `
        <div style="background: rgba(255,255,255,0.6); padding: 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.05); margin-bottom: 10px; text-align: left;">
            <div style="font-size: 18px; color: #1f2937; font-weight: 900; margin-bottom: 4px;">
                ${displayEn} ${posHtml} ${ipaHtml}
            </div>
            <div style="font-size: 15px; color: #374151;"><strong>Nghĩa:</strong> ${item.vi}</div>
            ${synHtml}
            ${antHtml}
            ${noteHtml}
        </div>
    `;

    // --- 2. GIẢI NGHĨA CÁC ĐÁP ÁN KHÁC TRONG CÂU ---
    let optionsHtml = '';
    const optionBtns = document.querySelectorAll('#vocab-options-container .option-btn');
    
    if (optionBtns.length > 0) {
        optionsHtml += `<div style="font-size: 14px; font-weight: bold; color: ${titleColor}; margin-bottom: 8px; text-align: left;">💡 Phân tích đáp án:</div>`;
        optionsHtml += `<div style="display: flex; flex-direction: column; gap: 6px; font-size: 14px; background: rgba(255,255,255,0.6); padding: 10px; border-radius: 10px; text-align: left;">`;
        
        optionBtns.forEach(btn => {
            let optText = btn.innerText.trim();
            let wordEn = optText;
            let wordVi = "???"; 

            let isOptCorrect = optText === vCurrentQuestion.correct;

            // Xử lý từ đồng nghĩa/trái nghĩa
            if (isOptCorrect && (vCurrentQuestion.type === 'synonym' || vCurrentQuestion.type === 'antonym')) {
                wordVi = item.tempExtraVi || "???";
            } 
            // [MỚI - ĐÃ FIX]: XỬ LÝ PHRASAL VERBS CHO DẠNG ĐỤC LỖ
            else if (vCurrentQuestion.type === 'fill_blank') {
                let baseWord = item.en.replace(/\[.*?\]/, '').trim(); // VD: lấy chữ "go" từ "go [on]"
                let combinedStr = baseWord + ' ' + optText; // Thử ghép "go" + "off"
                
                // Tra xem "go off" có trong kho từ vựng không
                let foundCombined = db.Vocabulary.find(v => v.en.replace(/\[|\]/g, '').toLowerCase() === combinedStr.toLowerCase());
                if (foundCombined) {
                    wordEn = combinedStr; // Đổi chữ hiển thị thành "go off"
                    wordVi = isOptCorrect ? "Đáp án chính xác" : foundCombined.vi; // Lấy nghĩa của "go off"
                } else {
                    // Nếu không có cụm đó, tìm xem từ đơn lẻ "off" có nghĩa không
                    let foundSingle = db.Vocabulary.find(v => v.en.replace(/\[|\]/g, '').toLowerCase() === optText.toLowerCase());
                    if (foundSingle) {
                        wordVi = foundSingle.vi;
                    } else {
                        wordVi = isOptCorrect ? "Từ điền chính xác" : "Không phù hợp ngữ cảnh";
                    }
                }
            } 
            // Dạng bình thường (En-Vi, Vi-En...)
            else {
                // Thêm replace để lọc ngoặc vuông khi tra nghĩa nhiễu
                let foundWord = db.Vocabulary.find(v => v.en.replace(/\[|\]/g, '') === optText || v.vi === optText);
                if (foundWord) {
                    wordEn = foundWord.en.replace(/\[|\]/g, '');
                    wordVi = foundWord.vi;
                }
            }

            let iconOpt = isOptCorrect ? "✅" : "❌";
            let colorOpt = isOptCorrect ? "#16a34a" : "#4b5563";
            let boldOpt = isOptCorrect ? "font-weight: bold;" : "";
            
            optionsHtml += `<div style="color: ${colorOpt}; ${boldOpt}">
                ${iconOpt} <strong>${wordEn}</strong>: ${wordVi}
            </div>`;
        });
        optionsHtml += `</div>`;
    }

    // --- 3. GỘP NỘI DUNG VÀO HTML CHÍNH ---
    let html = `
        <div style="font-size: 24px; font-weight: 900; color: ${titleColor}; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
            ${iconHtml} ${titleText}
        </div>
        <div style="max-height: 40vh; overflow-y: auto; padding-right: 5px; margin-bottom: 10px;">
            ${mainWordHtml}
            ${optionsHtml}
        </div>
    `;

    content.innerHTML = html;
    
    // MA THUẬT CSS: Tấm khiên "Bất tử" (Dùng translate3d và bỏ dìm móng)
    // ĐƯA VỀ GIAO DIỆN KHỐI BÌNH THƯỜNG (KHÔNG POPUP CỐ ĐỊNH NỮA)
    expDiv.style.cssText = `
        background: ${bgColor};
        border: 2px solid ${borderColor};
        padding: 20px;
        border-radius: 20px;
        margin-top: 20px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 30px rgba(0,0,0,0.05);
        animation: fadeInUp 0.4s ease;
    `;
    
    expDiv.classList.remove('hidden'); 

    // Nút "Tiếp tục" tối giản, không hack CSS
    const nextBtn = document.getElementById('vocab-next-btn');
    nextBtn.innerText = vLives <= 0 ? "XEM KẾT QUẢ" : "TIẾP TỤC";
    nextBtn.style.cssText = `
        font-family: inherit; 
        background: ${borderColor}; 
        color: #fff; 
        border: none; 
        width: 100%;
        padding: 16px;
        font-size: 18px;
        border-radius: 16px;
        margin-top: 15px; 
        font-weight: 900;
        cursor: pointer;
        text-transform: uppercase;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    `;

    // Tự động cuộn màn hình xuống một chút để học sinh thấy giải thích
    setTimeout(() => {
        expDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (window.innerWidth > 768) {
            nextBtn.focus({ preventScroll: true });
        }
    }, 100);

    // Chuyển câu lập tức, không cần chờ hiệu ứng lướt xuống nữa
    nextBtn.onclick = () => {
        expDiv.classList.add('hidden');
        nextVocabQuestion();
    };
}
// ---- KẾT THÚC HÀM TẠI ĐÂY ----

function nextVocabQuestion() {
    if (vLives <= 0) {
        if (currentVocabTopic !== 'ALL') updateVocabRanking(currentVocabTopic, vScore, vMaxStreak);
        
        let records = JSON.parse(localStorage.getItem('vocabRecords')) || { maxScore: 0, maxStreak: 0 };
        if (vScore > records.maxScore) records.maxScore = vScore;
        if (vMaxStreak > records.maxStreak) records.maxStreak = vMaxStreak;
        
        // [FIX LỖI IPHONE]: Bọc try...catch để không sập khi lưu kỷ lục ở chế độ Ẩn danh
        try {
            localStorage.setItem('vocabRecords', JSON.stringify(records));
        } catch (e) {
            console.log("Safari ẩn danh chặn lưu kỷ lục.");
        }

        document.getElementById('vocab-game-play-area').classList.add('hidden');
        document.getElementById('vocab-game-over').classList.remove('hidden');
        document.getElementById('vocab-final-score').innerText = vScore;
        document.getElementById('vocab-final-streak').innerText = vMaxStreak;

        // BỔ SUNG: Kiểm soát nút Chơi Lại ở Game Từ Vựng
        // [MỚI] TẠO NÚT CHƠI LẠI VÀ NÚT FLASHCARD Ở MÀN HÌNH GAME OVER
        const gameOverContainer = document.getElementById('vocab-game-over');
        if (gameOverContainer) {
            // Xóa các nút cũ để tạo 2 nút mới (đẹp và gọn hơn)
            const oldBtns = gameOverContainer.querySelectorAll('button, .action-btns-group');
            oldBtns.forEach(b => b.remove());
            
            let actionBtnsHTML = `
                <div class="action-btns-group" style="display:flex; flex-direction:column; gap:12px; margin-top:25px; width: 100%;">
                    <button class="btn btn-primary" style="width:100%; justify-content:center; padding:15px; font-size:16px;" id="btn-replay-vocab">🔄 Chơi Lại Từ Đầu</button>
            `;
            
            if (isIsolatedMode) {
                // Đang share link -> Nút 2 cho phép đổi qua Flashcard
                actionBtnsHTML += `<button class="btn btn-secondary" style="width:100%; justify-content:center; padding:15px; font-size:16px; border-color:var(--primary); color:var(--primary);" id="btn-flashcard-vocab">📖 Đổi sang Flashcard</button>`;
            } else {
                // Chơi bình thường -> Nút 2 là thoát về chọn bài
                actionBtnsHTML += `<button class="btn btn-secondary" style="width:100%; justify-content:center; padding:15px; font-size:16px;" id="btn-flashcard-vocab">🔙 Chọn Bộ Khác</button>`;
            }
            actionBtnsHTML += `</div>`;
            gameOverContainer.insertAdjacentHTML('beforeend', actionBtnsHTML);

            // Gắn sự kiện cho 2 nút vừa tạo
            document.getElementById('btn-replay-vocab').onclick = () => {
                if (isIsolatedMode) startVocabGame(); else openVocabGame();
            };

            document.getElementById('btn-flashcard-vocab').onclick = () => {
                if (isIsolatedMode) {
                    showIsolatedVocabMenu(currentVocabTopic); // Gọi bảng chọn chế độ lúc Share Link
                } else {
                    openVocabGame(); // Trở về sảnh từ vựng
                }
            };
        }

    } else {
        generateVocabQuestion();
    }
}

/* ==========================================
   11. QUẢN LÝ TÀI LIỆU PDF CHUYÊN SÂU
========================================== */
if (!db.Documents) db.Documents = {};

function openDocManage() {
    showScreen('screen-document');
    document.getElementById('app-title').innerText = "Kho Tài Liệu PDF";
    renderDocList();
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

async function saveNewDocument() {
    const subject = document.getElementById('doc-subject').value.trim();
    const title = document.getElementById('doc-title').value.trim();
    const fileInput = document.getElementById('doc-file');
    const linkInput = document.getElementById('doc-link').value.trim();
    const btn = document.getElementById('btn-upload-doc');

    if (!subject || !title) { alert("Vui lòng phân loại Môn học và đặt Tên tài liệu!"); return; }
    if (!fileInput.files[0] && !linkInput) { alert("Bạn cần chọn tệp PDF tải lên hoặc dán một đường link chia sẻ!"); return; }

    btn.innerText = "⏳ Đang tải tệp lên máy chủ... Vui lòng không đóng trang."; 
    btn.disabled = true;

    let finalUrl = linkInput;

    if (fileInput.files[0]) {
        const file = fileInput.files[0];
        if (file.size > 5 * 1024 * 1024) { 
            alert("⚠️ Kích thước tệp vượt quá 5MB. Để đảm bảo độ ổn định, vui lòng tải tệp này lên Google Drive cá nhân và sử dụng ô dán Link bên cạnh.");
            btn.innerText = "📤 Tải lên & Lưu Trữ"; btn.disabled = false;
            return;
        }
        try {
            const base64Data = await readFileAsBase64(file);
            const rawBase64 = base64Data.split(',')[1];
            
            const response = await fetch(CLOUD_API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'upload_pdf',
                    filename: title + ".pdf",
                    mimeType: file.type,
                    fileData: rawBase64
                })
            });
            const result = await response.json();
            if (result.url) {
                finalUrl = result.url;
            } else {
                throw new Error("Dịch vụ phản hồi lỗi.");
            }
        } catch (e) {
            alert("❌ Lỗi đường truyền khi tải tệp lên Drive. Hãy thử lại hoặc sử dụng phương pháp dán Link.");
            btn.innerText = "📤 Tải lên & Lưu Trữ"; btn.disabled = false;
            return;
        }
    }

    if (!db.Documents[subject]) db.Documents[subject] = [];
    db.Documents[subject].unshift({ title: title, url: finalUrl, date: new Date().toLocaleDateString('vi-VN') });
    
    localStorage.setItem('myStudyData', JSON.stringify(db));
    
    document.getElementById('doc-title').value = "";
    document.getElementById('doc-file').value = "";
    document.getElementById('doc-link').value = "";
    
    alert("✅ Cập nhật tài liệu vào kho thành công!");
    btn.innerText = "📤 Tải lên & Lưu Trữ"; btn.disabled = false;
    renderDocList();
}

function renderDocList() {
    const listDiv = document.getElementById('doc-manage-list');
    listDiv.innerHTML = "";
    
    if (!db.Documents || Object.keys(db.Documents).length === 0) {
        listDiv.innerHTML = "<p style='text-align:center; color: var(--text-muted); font-size: 15px;'>Hệ thống hiện chưa lưu trữ tài liệu nào.</p>";
        return;
    }

    for (let subject in db.Documents) {
        if (db.Documents[subject].length === 0) continue;
        
        const subjectGroup = document.createElement('div');
        subjectGroup.className = "document-subject-group";
        subjectGroup.innerHTML = `<h4 style="color: var(--primary); margin: 0 0 15px 0; border-bottom: 2px solid var(--border-color); padding-bottom: 8px; font-size: 18px;">📘 Phân môn: ${subject}</h4>`;
        
        const grid = document.createElement('div');
        grid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; margin-bottom: 25px;";

        db.Documents[subject].forEach((doc, index) => {
            const item = document.createElement('div');
            item.style.cssText = "background: var(--card-bg); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); display: flex; flex-direction: column; justify-content: space-between;";
            item.innerHTML = `
                <div style="margin-bottom: 15px;">
                    <div style="font-weight: 800; font-size: 16px; color: var(--primary); margin-bottom: 8px; line-height: 1.4;">📄 ${doc.title}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">Đã tải lên vào: ${doc.date}</div>
                </div>
                <div style="display: flex; gap: 10px; border-top: 1px dashed var(--border-color); padding-top: 15px;">
                    <a href="${doc.url}" target="_blank" class="btn btn-primary" style="flex: 1; border: none; text-decoration: none;">Xem Tài Liệu</a>
                    <button class="btn btn-danger" onclick="deleteDocument('${subject}', ${index})">Xóa</button>
                </div>
            `;
            grid.appendChild(item);
        });
        
        subjectGroup.appendChild(grid);
        listDiv.appendChild(subjectGroup);
    }
}

function deleteDocument(subject, index) {
    if (confirm("Xóa tài liệu này khỏi hệ thống? (Lưu ý: Tệp gốc trên Google Drive sẽ không tự động xóa)")) {
        db.Documents[subject].splice(index, 1);
        if (db.Documents[subject].length === 0) delete db.Documents[subject];
        localStorage.setItem('myStudyData', JSON.stringify(db));
        renderDocList();
    }
}

/* ==========================================================================
   12. KẾT NỐI CLOUD & ĐỒNG BỘ TIẾN ĐỘ (ĐÃ FIX LỖI ĐĂNG NHẬP)
========================================================================== */
async function syncToCloud() {
    if (!CLOUD_API_URL || CLOUD_API_URL === 'DÁN_WEB_APP_URL_MỚI_CỦA_BẠN_VÀO_ĐÂY') { alert("Bạn chưa cấu hình CLOUD_API_URL!"); return; }
    const password = prompt("🔒 Tính năng chỉ dành cho Giáo viên!\nVui lòng nhập mật khẩu để đồng bộ dữ liệu lên Cloud:");
    if (password !== "000000") { if (password !== null) alert("❌ Sai mật khẩu!"); return; }
    
    try {
        const payload = { action: 'sync_data', data: db };
        const response = await fetch(CLOUD_API_URL, { 
            method: 'POST', 
            headers: { "Content-Type": "text/plain;charset=utf-8" }, 
            body: JSON.stringify(payload) 
        });
        const resultText = await response.text();
        if (resultText === 'Sync Success') {
            alert("✅ Đã phát sóng đề thi lên Cloud thành công!");
        } else {
            alert("❌ Lỗi từ máy chủ: " + resultText);
        }
    } catch(e) { alert("❌ Lỗi mạng, không thể đồng bộ!"); }
}

async function fetchCloudData() {
    try {
        const response = await fetch(CLOUD_API_URL);
        const cloudDb = await response.json();
        if (cloudDb && Object.keys(cloudDb).length > 0) {
            db = cloudDb;
            if (!db.Vocabulary) db.Vocabulary = [];
            if (!db.Documents) db.Documents = {};
            localStorage.setItem('myStudyData', JSON.stringify(db));
        }
    } catch(e) { console.log("Không thể tải Cloud, đang dùng dữ liệu lưu trữ tạm trên máy."); }
}

async function fetchUserProgress() {
    const username = localStorage.getItem('studentName') || '';
    if (!username) return;
    try {
        const response = await fetch(CLOUD_API_URL, {
            method: 'POST',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: 'get_progress', username: username })
        });
        const progressList = await response.json();
        userProgress = {};
        progressList.forEach(p => {
            const key = `${p.subject}|${p.quizTitle}`;
            userProgress[key] = { completed: p.completed, score: p.lastScore, lastAttempt: p.lastAttempt };
        });
    } catch(e) { console.log("Lỗi lấy progress:", e); }
}

async function updateUserProgress(subject, quizTitle, completed, score) {
    const username = localStorage.getItem('studentName') || '';
    if (!username) return;
    try {
        await fetch(CLOUD_API_URL, {
            method: 'POST',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: 'update_progress', username: username, subject: subject, quizTitle: quizTitle, completed: completed, score: score })
        });
        const key = `${subject}|${quizTitle}`;
        userProgress[key] = { completed: completed, score: score, lastAttempt: new Date().toISOString() };
        if (currentSubject === subject) {
            renderQuizListWithFilters();
        }
    } catch(e) { console.log("Lỗi cập nhật progress:", e); }
}

/* ==========================================================================
   13. GÓC TẬP TRUNG (POMODORO & YOUTUBE LOFI)
========================================================================== */
let pomoInterval = null;
let pomoTimeLeft = 25 * 60; // Mặc định 25 phút
let isPomoRunning = false;
let currentPomoMode = 'pomodoro'; // pomodoro, shortBreak, longBreak
let pomoSessionCount = 0;

const pomoTimes = { pomodoro: 25 * 60, shortBreak: 5 * 60, longBreak: 15 * 60 };

function openFocusSpace() {
    showScreen('screen-focus');
    document.getElementById('app-title').innerText = "Góc Tập Trung";
}

function setPomoMode(mode) {
    if (isPomoRunning) {
        if (!confirm("Đồng hồ đang chạy. Đổi chế độ sẽ làm lại từ đầu. Bạn có chắc không?")) return;
    }
    clearInterval(pomoInterval);
    isPomoRunning = false;
    currentPomoMode = mode;
    pomoTimeLeft = pomoTimes[mode];
    
    document.getElementById('pomo-start-btn').innerText = "BẮT ĐẦU";
    document.getElementById('pomo-start-btn').style.background = ""; // Xóa màu đỏ (nếu có)
    updatePomoDisplay();

    // Cập nhật màu nút Tab
    document.getElementById('tab-pomo').className = mode === 'pomodoro' ? 'btn btn-primary' : 'btn btn-secondary';
    document.getElementById('tab-short').className = mode === 'shortBreak' ? 'btn btn-primary' : 'btn btn-secondary';
    document.getElementById('tab-long').className = mode === 'longBreak' ? 'btn btn-primary' : 'btn btn-secondary';
}

function togglePomoTimer() {
    const btn = document.getElementById('pomo-start-btn');
    if (isPomoRunning) {
        // Tạm dừng
        clearInterval(pomoInterval);
        isPomoRunning = false;
        btn.innerText = "TIẾP TỤC";
        btn.style.background = ""; 
    } else {
        // Bắt đầu chạy
        isPomoRunning = true;
        btn.innerText = "TẠM DỪNG";
        btn.style.background = "var(--danger)"; // Nút chuyển đỏ khi đang chạy
        
        pomoInterval = setInterval(() => {
            pomoTimeLeft--;
            updatePomoDisplay();
            
            if (pomoTimeLeft <= 0) {
                clearInterval(pomoInterval);
                isPomoRunning = false;
                playCorrectSound(); // Tái sử dụng tiếng "Ting" của game
                
                if (currentPomoMode === 'pomodoro') {
                    pomoSessionCount++;
                    document.getElementById('pomo-session-count').innerText = pomoSessionCount;
                    alert("🍅 Tuyệt vời! Bạn đã hoàn thành một phiên tập trung. Hãy nghỉ ngơi 5 phút nhé.");
                    setPomoMode('shortBreak');
                } else {
                    alert("⏰ Hết giờ nghỉ! Quay lại bàn học và bắt đầu phiên Pomodoro mới thôi nào!");
                    setPomoMode('pomodoro');
                }
            }
        }, 1000);
    }
}

function resetPomoTimer() {
    clearInterval(pomoInterval);
    isPomoRunning = false;
    pomoTimeLeft = pomoTimes[currentPomoMode];
    document.getElementById('pomo-start-btn').innerText = "BẮT ĐẦU";
    document.getElementById('pomo-start-btn').style.background = "";
    updatePomoDisplay();
}

function updatePomoDisplay() {
    let m = Math.floor(pomoTimeLeft / 60);
    let s = pomoTimeLeft % 60;
    document.getElementById('pomo-time').innerText = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
}

function loadLofiMusic() {
    let link = document.getElementById('lofi-youtube-link').value.trim();
    if (!link) return;
    let embedUrl = getYoutubeEmbedUrl(link);
    if (embedUrl) {
        document.getElementById('lofi-iframe').src = embedUrl + "&autoplay=1";
    } else {
        alert("❌ Link Youtube không hợp lệ! Hãy copy đường link trên thanh địa chỉ hoặc nút Chia sẻ của Youtube.");
    }
}

/* ==========================================================================
   14. QUẢN LÝ KHO NHẠC MP3 TRÊN CLOUD
========================================================================== */
if (!db.FocusMusic) db.FocusMusic = [];

function switchMusicTab(tab) {
    const btnYt = document.getElementById('tab-btn-youtube');
    const btnCloud = document.getElementById('tab-btn-cloud');
    const areaYt = document.getElementById('music-area-youtube');
    const areaCloud = document.getElementById('music-area-cloud');

    // Reset Audio Youtube khi qua Cloud
    if (tab === 'cloud') {
        let currentIframeSrc = document.getElementById('lofi-iframe').src;
        document.getElementById('lofi-iframe').src = currentIframeSrc.replace("&autoplay=1", "&autoplay=0");
    } else {
        // Tạm dừng nhạc Cloud khi qua Youtube
        document.getElementById('cloud-audio-player').pause();
    }

    if (tab === 'youtube') {
        btnYt.className = 'btn btn-primary btn-sm'; btnYt.style.border = 'none';
        btnCloud.className = 'btn btn-secondary btn-sm'; btnCloud.style.border = 'none';
        areaYt.classList.remove('hidden'); areaCloud.classList.add('hidden');
    } else {
        btnCloud.className = 'btn btn-primary btn-sm'; btnCloud.style.border = 'none';
        btnYt.className = 'btn btn-secondary btn-sm'; btnYt.style.border = 'none';
        areaCloud.classList.remove('hidden'); areaYt.classList.add('hidden');
        renderCloudMusic();
    }
}

// Chuyển đổi link Drive chuẩn sang link Stream (phát trực tiếp)
function getDriveStreamUrl(url) {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    return url;
}

async function uploadFocusAudio() {
    const fileInput = document.getElementById('cloud-audio-file');
    const btn = document.getElementById('btn-upload-audio');

    if (!fileInput.files[0]) { alert("Vui lòng chọn 1 file nhạc (.mp3) từ thiết bị!"); return; }
    
    const file = fileInput.files[0];
    if (file.size > 10 * 1024 * 1024) { 
        alert("⚠️ Kích thước file nhạc vượt quá 30MB. Vui lòng chọn file nhẹ hơn để đảm bảo tốc độ tải!"); return; 
    }

    btn.innerText = "⏳ Đang tải..."; btn.disabled = true;

    try {
        const base64Data = await readFileAsBase64(file); // Hàm này có sẵn từ phần PDF
        const rawBase64 = base64Data.split(',')[1];
        
        // Tái sử dụng hàm upload_pdf của server (nó lưu file gì cũng được)
        const response = await fetch(CLOUD_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'upload_pdf', 
                filename: "NhacLofi_" + file.name,
                mimeType: file.type,
                fileData: rawBase64
            })
        });
        const result = await response.json();
        
        if (result.url) {
            db.FocusMusic.unshift({ title: file.name.replace('.mp3',''), url: result.url });
            localStorage.setItem('myStudyData', JSON.stringify(db));
            alert("✅ Tải nhạc lên hệ thống Cloud thành công!");
            fileInput.value = "";
            renderCloudMusic();
        } else { throw new Error("Máy chủ không phản hồi."); }
    } catch (e) {
        alert("❌ Lỗi đường truyền khi tải lên Cloud. Hãy thử lại sau.");
    }
    btn.innerText = "Tải Lên ☁️"; btn.disabled = false;
}

function renderCloudMusic() {
    const listDiv = document.getElementById('cloud-music-list');
    listDiv.innerHTML = "";
    
    if (db.FocusMusic.length === 0) {
        listDiv.innerHTML = "<p style='text-align:center; color: var(--text-muted); font-size: 14px; margin-top: 20px;'>Kho nhạc trống. Hãy tải lên những bài hát bạn yêu thích nhé!</p>";
        return;
    }

    db.FocusMusic.forEach((song, index) => {
        const item = document.createElement('div');
        item.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--card-bg); border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 10px; transition: 0.2s;";
        
        item.innerHTML = `
            <div style="flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer; color: var(--text-main); font-weight: 500;" onclick="playCloudAudio(${index})">
                <i class="ph-duotone ph-music-notes" style="color: var(--primary); margin-right: 8px;"></i> ${song.title}
            </div>
            <button class="btn btn-danger btn-sm" style="padding: 5px 10px; font-size: 12px; margin-left: 10px;" onclick="deleteCloudAudio(${index})"><i class="ph-bold ph-trash"></i></button>
        `;
        // Hiệu ứng hover
        item.onmouseenter = () => item.style.borderColor = "var(--primary)";
        item.onmouseleave = () => item.style.borderColor = "var(--border-color)";
        
        listDiv.appendChild(item);
    });
}

function playCloudAudio(index) {
    const song = db.FocusMusic[index];
    const player = document.getElementById('cloud-audio-player');
    const displayTitle = document.getElementById('cloud-now-playing');
    
    // Convert link Google Drive sang định dạng Stream MP3
    const streamUrl = getDriveStreamUrl(song.url);
    
    player.src = streamUrl;
    player.play();
    displayTitle.innerHTML = `<span style="color: var(--success);">▶️ Đang phát:</span> ${song.title}`;
}

function deleteCloudAudio(index) {
    if (confirm("Xóa bài nhạc này khỏi danh sách phát?")) {
        db.FocusMusic.splice(index, 1);
        localStorage.setItem('myStudyData', JSON.stringify(db));
        renderCloudMusic();
    }
}

/* ==========================================================================
   TÍNH NĂNG QUÉT CHUỘT & CHỌN TẤT CẢ (KHO TỪ VỰNG) - V2 (SIÊU MƯỢT)
========================================================================== */

// Hàm xử lý nút "Chọn tất cả" (Đã fix lỗi sai tên class)
function toggleSelectAllVocab() {
    const isChecked = document.getElementById('vocab-select-all').checked;
    const checkboxes = document.querySelectorAll('.vocab-checkbox'); 
    checkboxes.forEach(cb => cb.checked = isChecked);
}

// Bắt sự kiện bật/tắt chế độ "Chọn nhiều" để hiện nút Chọn tất cả
const originalToggleBulk = toggleVocabBulkDelete;
toggleVocabBulkDelete = function() {
    originalToggleBulk(); // Chạy hàm cũ
    const selectAllContainer = document.getElementById('vocab-select-all-container');
    const btnConfirm = document.getElementById('btn-confirm-bulk');
    
    if (btnConfirm.classList.contains('hidden')) {
        selectAllContainer.classList.add('hidden');
    } else {
        selectAllContainer.classList.remove('hidden');
        document.getElementById('vocab-select-all').checked = false; // Reset lại
    }
}

// MA THUẬT QUÉT CHUỘT V2 (QUÉT CẢ DÒNG)
let isDraggingVocabSelect = false;
let dragVocabCheckValue = true;

const vocabListContainer = document.getElementById('vocab-manage-list');

// Khi bấm chuột xuống MỘT DÒNG BẤT KỲ
vocabListContainer.addEventListener('mousedown', function(e) {
    if (!isVocabBulkDeleteMode) return; // Chỉ kích hoạt khi đang bật Chọn nhiều

    // Tìm xem chuột có đang nằm trong một dòng từ vựng không
    const row = e.target.closest('.vocab-item-row');
    if (row) {
        const checkbox = row.querySelector('.vocab-checkbox');
        if (checkbox) {
            isDraggingVocabSelect = true;
            
            // Nếu click ra ngoài ô checkbox (click vào chữ), thì tự động đảo ngược trạng thái ô tick
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            
            // Ghi nhớ trạng thái để áp dụng cho các dòng lướt qua sau đó
            dragVocabCheckValue = checkbox.checked;
            e.preventDefault(); // Tránh bôi đen văn bản khi đang kéo chuột
        }
    }
});

// Khi lướt chuột qua các dòng khác
vocabListContainer.addEventListener('mouseover', function(e) {
    if (isDraggingVocabSelect && isVocabBulkDeleteMode) {
        const row = e.target.closest('.vocab-item-row');
        if (row) {
            const checkbox = row.querySelector('.vocab-checkbox');
            if (checkbox && checkbox.checked !== dragVocabCheckValue) {
                checkbox.checked = dragVocabCheckValue; // Copy trạng thái
            }
        }
    }
});

// Khi nhả chuột ra ở bất kỳ đâu trên màn hình
window.addEventListener('mouseup', function() {
    isDraggingVocabSelect = false;
});

/* ==========================================================================
   15. CHẾ ĐỘ XUẤT BẢN IN PDF (ĐÃ FIX LỖI ĐẢO CHỮ A, B, C, D & TÁCH YÊU CẦU ĐỀ)
========================================================================== */
function printCurrentQuiz() {
    if (currentQuizIndex === -1) {
        alert("⚠️ Vui lòng chọn một đề thi để in.");
        return;
    }

    const quizTitle = db[currentSubject][currentQuizIndex].title;
    const originalQuestions = db[currentSubject][currentQuizIndex].questions;
    
    // --- KHÚC 1: HEADER & PHIẾU TRẢ LỜI ---
    let headerHTML = `
        <div class="print-header">
            <h2>Môn: ${currentSubject}</h2>
            <h3 style="margin-top: 0;">${quizTitle}</h3>
            <div class="print-info">
                <span>Họ và Tên: ............................................................</span>
                <span>Lớp: ....................</span>
            </div>
            <div class="print-info">
                <span>Thời gian: ................ phút</span>
                <span>Điểm số: ......... / 10</span>
            </div>
            <hr style="border: 1px solid black; margin-bottom: 20px;">
        </div>
    `;

    let answerSheetHTML = `
        <div style="margin-bottom: 30px;">
            <h3 style="text-align: center; text-transform: uppercase; margin-bottom: 25px; font-size: 16pt;">Phiếu Trả Lời Trắc Nghiệm</h3>
            <div style="column-count: 4; column-gap: 25px;">
    `;

    let questionsHTML = `
        <div style="page-break-before: always; padding-top: 10px;">
            <h3 style="text-align: center; margin-top: 0; margin-bottom: 20px; text-transform: uppercase; font-size: 16pt;">NỘI DUNG ĐỀ THI</h3>
    `;

    let questionCounter = 1;
    let lastInstructionLine = ""; 
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    const labelsTF = ['a', 'b', 'c', 'd'];

    const smartCleanText = (text) => {
        if (!text) return "";
        let cleaned = text.replace(/(?:<br>|\n|^)\s*(?:Câu|Question|Bài)\s*\d+[\.\:\-]?\s*/gi, '<br>');
        let lines = cleaned.split(/<br>|\n/).map(l => l.trim()).filter(l => l !== '');
        if (lines.length > 0) {
            let firstLineText = lines[0].replace(/<[^>]+>/g, '').trim();
            if (/(mark|choose|chọn|indicate|read|đọc|điền)/i.test(firstLineText) && firstLineText.length > 15) {
                if (firstLineText === lastInstructionLine) { lines.shift(); } 
                else { lastInstructionLine = firstLineText; }
            }
        }
        return lines.join('<br>');
    };

    const getBubbleHTML = (qNum, type, data) => {
        let blockStyle = "break-inside: avoid; break-inside: avoid-column; margin-bottom: 12px;";
        if (type === 'writing' || type === 'short-answer') {
            return `<div style="display:flex; align-items:flex-end; gap:6px; font-size: 12pt; ${blockStyle}"><strong>${qNum}.</strong> <span style="border-bottom:1px dotted #000; flex:1; height:18px;"></span></div>`;
        }
        if (type === 'cluster-tf') {
            let tfHtml = `<div style="font-size: 12pt; display:flex; flex-direction:column; gap:4px; ${blockStyle}"><strong>${qNum}.</strong>`;
            data.forEach((stmt, idx) => {
                let L = labelsTF[idx] || '-';
                tfHtml += `<div style="display:flex; align-items:center; gap:6px; margin-left: 10px;"><strong>${L})</strong> 
                             <div style="border:1px solid #000; border-radius:50%; width:16px; height:16px; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:bold;">Đ</div>
                             <div style="border:1px solid #000; border-radius:50%; width:16px; height:16px; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:bold;">S</div>
                           </div>`;
            });
            tfHtml += `</div>`;
            return tfHtml;
        }
        let bubbles = '';
        let limit = Math.min(data || 4, 6); 
        for(let i=0; i<limit; i++) {
            bubbles += `<div style="border:1px solid #000; border-radius:50%; width:18px; height:18px; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">${labels[i]}</div>`;
        }
        return `<div style="display:flex; align-items:center; gap:6px; font-size: 12pt; ${blockStyle}"><strong style="width:22px; text-align:right; margin-right:4px;">${qNum}.</strong> ${bubbles}</div>`;
    };

    // --- KHÚC 2: RENDER CÂU HỎI VÀ TỰ ĐỘNG CHÈN LẠI CHỮ A,B,C,D ---
    originalQuestions.forEach((q) => {
        if (q.type === 'reading-cluster') {
            // --- BÓC TÁCH YÊU CẦU ĐỀ CHO BẢN IN PDF ---
            let contextLines = q.context.split(/<br>|\n/);
            let firstLine = contextLines[0].replace(/<[^>]+>/g, '').trim();
            let instructionHTML = "";
            
            if (/(mark|choose|chọn|indicate|read|đọc|điền)/i.test(firstLine) && firstLine.length > 15) {
                let instruction = contextLines.shift(); // Rút dòng yêu cầu ra
                // [MỚI] Thêm lệnh break-after: avoid để ép dòng yêu cầu phải bám dính lấy đoạn văn bên dưới
                instructionHTML = `<div style="font-style: italic; font-weight: bold; margin-bottom: 12px; font-size: 13pt; page-break-after: avoid; break-after: avoid;">${formatText(instruction)}</div>`;
            }
            
            let passageText = contextLines.join('<br>');
            let passageHTML = "";
            if (passageText.trim()) {
                // [MỚI] Xóa class print-question, cấp quyền break-inside: auto để đoạn văn được phép "cắt bảng" tràn sang trang sau một cách tự nhiên
                passageHTML = `<div style="margin-bottom: 15px; border: 1px solid #000; padding: 15px; border-radius: 4px; text-align: justify; font-family: 'Times New Roman', Times, serif; page-break-inside: auto; break-inside: auto;">${formatText(passageText)}</div>`;
            }
            
            // Gộp chung vào 1 khối bao bọc
            questionsHTML += `<div style="margin-bottom: 20px;">` + instructionHTML + passageHTML + `</div>`;
            // ---------------------------------------------
            
            q.questions.forEach(subQ => {
                let optionsHTML = ''; let maxLen = 0; 
                if (subQ.options && subQ.options.length > 0) {
                    subQ.options.forEach((opt, idx) => { 
                        let cleanStr = cleanOpt(opt); // Tẩy bỏ chữ cái cũ
                        let textOnly = cleanStr.replace(/<[^>]*>?/gm, ''); 
                        if (textOnly.length > maxLen) maxLen = textOnly.length;
                        // Ép chữ cái mới (A, B, C, D) tuyệt đối không xê dịch
                        optionsHTML += `<div class="print-opt-item"><strong>${labels[idx]}.</strong> ${cleanStr}</div>`; 
                    });
                } else if (subQ.type === 'writing' || subQ.type === 'short-answer') {
                    optionsHTML += `<div style="margin-top: 10px; border-bottom: 1px dotted #000; height: 25px; width: 100%;"></div>`;
                }
                let gridClass = maxLen > 60 ? "cols-1" : (maxLen > 28 ? "cols-2" : "cols-4");
                questionsHTML += `<div class="print-question"><div class="print-q-title">Câu ${questionCounter}: ${formatText(smartCleanText(subQ.content))}</div><div class="print-q-options ${gridClass}">${optionsHTML}</div></div>`;
                answerSheetHTML += getBubbleHTML(questionCounter, subQ.type, subQ.options ? subQ.options.length : 0);
                questionCounter++;
            });
        } 
        else if (q.type === 'cluster-tf') {
            let stmtHTML = '<table style="width:100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 10px;" border="1"><tr><th style="padding:6px; text-align:center;">Mệnh đề</th><th style="width:60px; padding:6px; text-align:center;">Đúng</th><th style="width:60px; padding:6px; text-align:center;">Sai</th></tr>';
            q.statements.forEach((stmt, idx) => { 
                let cleanStr = cleanOpt(stmt.text); // Tẩy bỏ chữ cái cũ
                // Ép chữ cái mới (a, b, c, d)
                stmtHTML += `<tr><td style="padding:8px;"><strong>${labelsTF[idx]})</strong> ${formatText(cleanStr)}</td><td></td><td></td></tr>`; 
            });
            stmtHTML += '</table>';
            questionsHTML += `<div class="print-question"><div class="print-q-title">Câu ${questionCounter}: ${formatText(smartCleanText(q.content))}</div>${stmtHTML}</div>`;
            answerSheetHTML += getBubbleHTML(questionCounter, q.type, q.statements);
            questionCounter++;
        } 
        else {
            let optionsHTML = ''; let maxLen = 0;
            if (q.options && q.options.length > 0) {
                q.options.forEach((opt, idx) => { 
                    let cleanStr = cleanOpt(opt); // Tẩy bỏ chữ cái cũ
                    let textOnly = cleanStr.replace(/<[^>]*>?/gm, '');
                    if (textOnly.length > maxLen) maxLen = textOnly.length;
                    // Gắn chữ cái mới
                    optionsHTML += `<div class="print-opt-item"><strong>${labels[idx]}.</strong> ${cleanStr}</div>`; 
                });
            } else if (q.type === 'writing' || q.type === 'short-answer') {
                optionsHTML += `<div style="margin-top: 10px; border-bottom: 1px dotted #000; height: 25px; width: 100%;"></div><div style="margin-top: 10px; border-bottom: 1px dotted #000; height: 25px; width: 100%;"></div>`;
            }
            let gridClass = maxLen > 60 ? "cols-1" : (maxLen > 28 ? "cols-2" : "cols-4");
            let audioNotice = (q.content && q.content.includes('[AUDIO:')) ? `<div style="font-style: italic; color: #555; margin-bottom: 5px;">(Nghe file Audio để làm câu này)</div>` : '';
            questionsHTML += `<div class="print-question"><div class="print-q-title">Câu ${questionCounter}: ${formatText(smartCleanText(q.content))}</div>${audioNotice}<div class="print-q-options ${gridClass}">${optionsHTML}</div></div>`;
            answerSheetHTML += getBubbleHTML(questionCounter, q.type, q.options ? q.options.length : 0);
            questionCounter++;
        }
    });

    answerSheetHTML += `</div></div>`; 
    questionsHTML += `<div style="text-align: center; margin-top: 30px; font-weight: bold; font-size: 16pt;">--- HẾT ---</div></div>`;

    // --- KHÚC 3: TỰ ĐỘNG SINH BẢNG ĐÁP ÁN Ở TRANG CUỐI ---
    let keyHTML = `
        <div style="page-break-before: always; padding-top: 20px;">
            <h3 style="text-align: center; text-transform: uppercase; font-size: 16pt; margin-bottom: 20px;">BẢNG ĐÁP ÁN ĐỀ THI</h3>
            <div style="column-count: 4; column-gap: 25px; font-size: 13pt;">
    `;
    
    let keyCounter = 1;
    
    const getAnswerLabel = (opts) => {
        if (!opts || opts.length === 0) return "<i>Tự luận</i>";
        for (let i = 0; i < opts.length; i++) {
            if (opts[i].startsWith('*')) return `<strong>${labels[i]}</strong>`;
        }
        return "?";
    };

    originalQuestions.forEach(q => {
        if (q.type === 'reading-cluster') {
            q.questions.forEach(subQ => {
                keyHTML += `<div style="margin-bottom: 8px; break-inside: avoid;"><strong>${keyCounter}.</strong> ${getAnswerLabel(subQ.options)}</div>`;
                keyCounter++;
            });
        } else if (q.type === 'cluster-tf') {
            let tfAns = [];
            q.statements.forEach(stmt => { tfAns.push(stmt.correctAnswer === "Đúng" ? "Đ" : "S"); });
            keyHTML += `<div style="margin-bottom: 8px; break-inside: avoid;"><strong>${keyCounter}.</strong> <strong>${tfAns.join('-')}</strong></div>`;
            keyCounter++;
        } else {
            keyHTML += `<div style="margin-bottom: 8px; break-inside: avoid;"><strong>${keyCounter}.</strong> ${getAnswerLabel(q.options)}</div>`;
            keyCounter++;
        }
    });
    keyHTML += `</div></div>`;

    // --- GỘP TẤT CẢ VÀ GỌI MÁY IN ---
    let finalPrintHTML = headerHTML + answerSheetHTML + questionsHTML + keyHTML;
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = finalPrintHTML;
    
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) { 
        MathJax.typesetPromise([printArea]).then(() => { window.print(); }).catch(err => { window.print(); });
    } else {
        window.print();
    }
}

/* ==========================================================================
   17. EPIC 5: LÔ-GÍC BỘ CÔNG CỤ SƯ PHẠM (ROLE, PROJECTOR, SHUFFLE)
========================================================================== */

// TASK 501: Xử lý Phân quyền (Có mật khẩu bảo mật)
let isTeacherMode = false; // [MỚI] Mặc định vào web sẽ là Học sinh

function toggleRole() {
    // Nếu đang là học sinh và muốn lên làm Giáo viên -> Bắt nhập pass
    if (!isTeacherMode) {
        const pin = prompt("🔒 KÍCH HOẠT QUYỀN GIÁO VIÊN\nVui lòng nhập mã PIN quản trị:");
        if (pin !== "020945") { // Mật khẩu mặc định là 6 số 0
            if (pin !== null) alert("❌ Sai mã PIN! Bạn không có quyền truy cập.");
            return;
        }
    }

    // Nếu nhập đúng (hoặc đang là Giáo viên muốn trở về Học sinh) thì đổi trạng thái
    isTeacherMode = !isTeacherMode;
    const badge = document.getElementById('role-badge');
    badge.innerText = isTeacherMode ? "👩‍🏫 Giáo viên" : "🎓 Học sinh";
    badge.className = isTeacherMode ? "role-badge teacher" : "role-badge student";
    
    // Đóng/mở các nút công cụ
    document.body.classList.toggle('student-mode', !isTeacherMode);
    
    const msg = isTeacherMode 
        ? "🔓 ĐÃ BẬT CHẾ ĐỘ GIÁO VIÊN: Kích hoạt toàn quyền quản trị (Thêm, Sửa, Xóa, Trộn đề, In ấn)." 
        : "🔒 ĐÃ BẬT CHẾ ĐỘ HỌC SINH: Giao diện đã được khóa an toàn.";
    alert(msg);
}

// [MỚI] Ép hệ thống tự động đưa về giao diện Học sinh ngay khi tải trang
document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('student-mode');
    const badge = document.getElementById('role-badge');
    if(badge) {
        badge.innerText = "🎓 Học sinh";
        badge.className = "role-badge student";
    }
});

// TASK 503: Xử lý Trình chiếu (Projector Mode)
function toggleProjectorMode() {
    const practiceScreen = document.getElementById('screen-practice');
    practiceScreen.classList.toggle('projector-mode');
    
    if (practiceScreen.classList.contains('projector-mode')) {
        // Kích hoạt API Fullscreen của hệ điều hành
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        }
    } else {
        // Thoát Fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// TASK 502: Thuật toán Trộn Đề & Đảo Đáp Án (Bản vá lỗi mất dữ liệu Đọc Hiểu)
function shuffleCurrentQuiz() {
    if (!currentQuizQuestions || currentQuizQuestions.length === 0) return;
    
    if (!confirm("⚠️ LƯU Ý: Thao tác này sẽ đảo lộn toàn bộ thứ tự câu hỏi và vị trí A, B, C, D. Bạn có chắc chắn muốn trộn?")) return;

    // 1. THUẬT TOÁN TRỘN CHUẨN (FISHER-YATES SHUFFLE) - Khắc phục lỗi mất dữ liệu
    const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    };

    // 2. DEEP CLONE: Nhân bản toàn bộ dữ liệu ra một bản sao mới tinh để không làm vỡ cấu trúc gốc
    let clonedQuestions = JSON.parse(JSON.stringify(currentQuizQuestions));

    // 3. Trộn mảng câu hỏi chính (Các cụm Đọc Hiểu sẽ bị đảo vị trí nhưng không bị vỡ)
    shuffleArray(clonedQuestions);

    // 4. Đi sâu vào trộn đáp án bên trong
    clonedQuestions.forEach(q => {
        // A. Trộn câu Trắc nghiệm thường
        if (q.options && q.options.length > 0) {
            shuffleArray(q.options);
        }
        
        // B. Xử lý cụm Đọc Hiểu / Ngữ Liệu
        if (q.type === 'reading-cluster' && q.questions) {
            // Tuyệt đối KHÔNG trộn thứ tự câu hỏi con trong bài đọc để tránh học sinh bị loạn mạch văn
            // Chỉ đi sâu vào trộn các đáp án A, B, C, D của từng câu hỏi con
            q.questions.forEach(subQ => {
                if (subQ.options && subQ.options.length > 0) {
                    shuffleArray(subQ.options);
                }
            });
        }
        
        // C. Xử lý cụm Đúng/Sai
        if (q.type === 'cluster-tf' && q.statements) {
            shuffleArray(q.statements);
        }
    });

    // 5. Ghi đè bản sao đã trộn hoàn hảo lên hệ thống
    currentQuizQuestions = clonedQuestions;
    db[currentSubject][currentQuizIndex].questions = currentQuizQuestions;
    localStorage.setItem('myStudyData', JSON.stringify(db));

    // 6. Dọn dẹp rác của lần làm bài trước
    currentQuestionIndex = 0;
    sessionCorrectCount = 0;
    hasAnsweredCurrent = false;
    testAnswers = [];
    clusterSelections = [];
    focusedOptionBtn = null;
    
    const optionsContainer = document.getElementById('options-container');
    if (optionsContainer) optionsContainer.innerHTML = '';
    const feedback = document.getElementById('feedback');
    if (feedback) feedback.innerText = '';
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) nextBtn.classList.add('hidden');

    // 7. Tải lại màn hình làm bài
    renderQuestion(); 
    
    alert("🔀 Trộn đề thành công! Cấu trúc Đọc Hiểu đã được bảo toàn. Bạn có thể in đề ngay.");
}

/* ==========================================================================
   18. CHẾ ĐỘ GIẢNG BÀI (TEACH MODE) - TRÍ NHỚ VĨNH CỬU & BẢNG TƯƠNG TÁC
========================================================================== */
let currentTeachQuizIndex = -1;

function startTeachMode(quizIndex) {
    currentTeachQuizIndex = quizIndex;
    const quiz = db[currentSubject][quizIndex];
    document.getElementById('teach-title').innerText = "Giảng bài: " + quiz.title;
    
    const contentDiv = document.getElementById('teach-content');
    
    // NẾU GIÁO VIÊN ĐÃ LƯU BẢN NHÁP TRƯỚC ĐÓ -> TẢI LẠI BẢN NHÁP BẤT TỬ
    if (quiz.annotatedDoc) {
        contentDiv.innerHTML = quiz.annotatedDoc;
    } 
    // NẾU LÀ LẦN ĐẦU TIÊN MỞ -> TỰ ĐỘNG DÀN TRANG TỪ DỮ LIỆU GỐC
    else {
        let html = "";
        let qCount = 1;
        quiz.questions.forEach(q => {
            if (q.type === 'reading-cluster') {
                html += `<div style="margin-bottom:20px; padding:20px; background:rgba(0,0,0,0.02); border:1px solid var(--border-color); border-radius:8px;">${formatText(q.context)}</div>`;
                q.questions.forEach(sq => {
                    html += `<div style="margin-bottom:25px;"><strong>Câu ${qCount}:</strong> ${formatText(sq.content)}<br><div style="margin-left:20px; margin-top:10px;">`;
                    sq.options.forEach(opt => html += `<div style="margin-bottom:8px;">${opt}</div>`);
                    html += `</div></div>`;
                    qCount++;
                });
            } else {
                html += `<div style="margin-bottom:25px;"><strong>Câu ${qCount}:</strong> ${formatText(q.content)}<br><div style="margin-left:20px; margin-top:10px;">`;
                if (q.options) q.options.forEach(opt => html += `<div style="margin-bottom:8px;">${opt}</div>`);
                if (q.type === 'cluster-tf') q.statements.forEach(st => html += `<div style="margin-bottom:8px;">- ${st.text} (Đ/S)</div>`);
                html += `</div></div>`;
                qCount++;
            }
        });
        contentDiv.innerHTML = html;
    }

    showScreen('screen-teach');
    setTimeout(resizeTeachCanvas, 300); // Khởi tạo lớp kính vẽ
}

function exitTeachMode() {
    if (confirm("Thoát chế độ Giảng bài? Đừng quên bấm [Lưu Ghi Chú] nếu bạn đã chỉnh sửa nhé!")) {
        openSubject(currentSubject);
    }
}

// LƯU TOÀN BỘ VĂN BẢN VÀO MÁY (Trí nhớ bất tử)
// [ĐÃ FIX] Thêm biến "silent" để nếu hệ thống tự lưu thì không nhảy thông báo làm phiền Giáo viên
function saveTeachDoc(silent = false) {
    if (currentTeachQuizIndex === -1) return;
    const contentHTML = document.getElementById('teach-content').innerHTML;
    db[currentSubject][currentTeachQuizIndex].annotatedDoc = contentHTML;
    localStorage.setItem('myStudyData', JSON.stringify(db));
    
    // Chỉ hiện thông báo khi bấm nút LƯU GHI CHÚ thủ công
    if (!silent) alert("✅ Đã lưu toàn bộ ghi chú, highlight và chỉnh sửa văn bản thành công!");
}

// [MỚI] Tự động lưu im lặng khi gõ chữ (Word mode)
const teachContentDiv = document.getElementById('teach-content');
if (teachContentDiv) {
    teachContentDiv.addEventListener('input', () => saveTeachDoc(true));
}

// BỘ CÔNG CỤ BÔI DẠ QUANG (IELTS HIGHLIGHT) - [ĐÃ FIX]
let teachSelectionRange = null;

document.addEventListener('mouseup', function(e) {
    const tooltip = document.getElementById('highlight-tooltip');
    const selection = window.getSelection();

    // Chỉ hoạt động trong chế độ Giảng bài
    if (document.getElementById('screen-teach').classList.contains('hidden')) return;

    if (selection.isCollapsed) {
        if (!e.target.closest('#highlight-tooltip')) { tooltip.classList.add('hidden'); }
        return;
    }

    teachSelectionRange = selection.getRangeAt(0).cloneRange();
    const rect = teachSelectionRange.getBoundingClientRect();
    
    // [ĐÃ FIX] Bỏ window.scrollY đi vì đã dùng CSS position fixed
    tooltip.style.left = `${rect.left + (rect.width / 2) - 45}px`;
    tooltip.style.top = `${rect.top - 45}px`;
    tooltip.classList.remove('hidden');
});

function applyHighlight() {
    const tooltip = document.getElementById('highlight-tooltip');
    if (!teachSelectionRange) return;
    
    // [ĐÃ FIX LỖI KHÔNG TÔ MÀU]: Phục hồi lại vùng bôi đen (vì thao tác click nút làm mất Focus của trình duyệt)
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(teachSelectionRange);
    
    // Đánh lệnh tô màu (Hỗ trợ đa trình duyệt)
    document.execCommand("hiliteColor", false, "#fef08a"); // Cho Chrome/Safari
    document.execCommand("backColor", false, "#fef08a");   // Cho Firefox/Edge
    
    // Dọn dẹp sau khi tô xong
    selection.removeAllRanges();
    tooltip.classList.add('hidden');
    
    // Tự động lưu nhưng ở chế độ IM LẶNG (Không hiện Alert)
    saveTeachDoc(true); 
}

// BỘ CÔNG CỤ VẼ TAY LÊN KÍNH CANVAS
const tCanvas = document.getElementById('teach-canvas');
const tCtx = tCanvas ? tCanvas.getContext('2d') : null;
let isTDrawing = false, tCurrentTool = 'cursor', tLastX = 0, tLastY = 0;

function resizeTeachCanvas() {
    if (!tCanvas) return;
    const wrapper = document.getElementById('teach-document-wrapper');
    tCanvas.width = wrapper.scrollWidth; tCanvas.height = wrapper.scrollHeight;
}

function setTeachMode(mode) {
    tCurrentTool = mode;
    document.querySelectorAll('#teach-toolbox .wb-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tb-${mode}`).classList.add('active');

    if (mode === 'cursor') {
        tCanvas.style.pointerEvents = 'none'; // Thủng kính để gõ chữ
    } else {
        tCanvas.style.pointerEvents = 'auto'; // Hứng chuột để vẽ
        tCanvas.style.cursor = 'crosshair';
        tCtx.globalCompositeOperation = 'source-over'; tCtx.lineJoin = 'round'; tCtx.lineCap = 'round';
        if (mode === 'pen-red') { tCtx.strokeStyle = '#ef4444'; tCtx.lineWidth = 3; }
        else if (mode === 'pen-blue') { tCtx.strokeStyle = '#3b82f6'; tCtx.lineWidth = 3; }
        else if (mode === 'highlighter') { tCtx.strokeStyle = 'rgba(234, 179, 8, 0.4)'; tCtx.lineWidth = 20; }
        else if (mode === 'eraser') { tCtx.globalCompositeOperation = 'destination-out'; tCtx.lineWidth = 30; }
    }
}

if (tCanvas) {
    tCanvas.addEventListener('mousedown', (e) => { isTDrawing = true; const r = tCanvas.getBoundingClientRect(); tLastX = e.clientX - r.left; tLastY = e.clientY - r.top; });
    tCanvas.addEventListener('mousemove', (e) => {
        if (!isTDrawing) return; e.preventDefault(); const r = tCanvas.getBoundingClientRect();
        const curX = e.clientX - r.left, curY = e.clientY - r.top;
        tCtx.beginPath(); tCtx.moveTo(tLastX, tLastY); tCtx.lineTo(curX, curY); tCtx.stroke();
        tLastX = curX; tLastY = curY;
    });
    tCanvas.addEventListener('mouseup', () => isTDrawing = false);
    tCanvas.addEventListener('mouseout', () => isTDrawing = false);
}

function clearTeachCanvas() {
    if (confirm("Xóa sạch các nét vẽ tay trên màn hình?")) tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
}

async function exportTeachPDF() {
    const wrapper = document.getElementById('teach-document-wrapper');
    const btn = document.querySelector('button[onclick="exportTeachPDF()"]');
    btn.innerHTML = "⏳ Đang xuất...";
    try {
        const canvasImage = await html2canvas(wrapper, { scale: 2, useCORS: true });
        const imgData = canvasImage.toDataURL('image/jpeg', 0.9);
        const { jsPDF } = window.jspdf; const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth(); const pdfHeight = (canvasImage.height * pdfWidth) / canvasImage.width;
        pdf.addImage(imgData, 'JPEG', 0, 10, pdfWidth, pdfHeight);
        pdf.save(`BaiGiang_${new Date().getTime()}.pdf`);
        alert("✅ Xuất PDF thành công!");
    } catch (err) { alert("Lỗi: " + err); } finally { btn.innerHTML = "<i class='ph-bold ph-download-simple'></i> LƯU PDF"; }
}

/* ==========================================================================
   20. EPIC 6 - XỬ LÝ THANH ĐIỀU HƯỚNG ĐIỆN THOẠI (BOTTOM NAV)
========================================================================== */
function setActiveNav(clickedElement) {
    // Tắt hết trạng thái active của các nút khác
    document.querySelectorAll('#bottom-nav .nav-item').forEach(el => {
        el.classList.remove('active');
    });
    // Bật sáng nút vừa được bấm
    clickedElement.classList.add('active');
}

/* ==========================================================================
   21. EPIC 6 - TỐI ƯU TRẢI NGHIỆM ĐIỆN THOẠI (CỬ CHỈ VUỐT - SWIPE)
========================================================================== */
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

const practiceScreenEl = document.getElementById('screen-practice');

if (practiceScreenEl) {
    practiceScreenEl.addEventListener('touchstart', function(e) {
        if (e.target.tagName.toLowerCase() === 'canvas') return;
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true }); // <-- Thêm option này

    practiceScreenEl.addEventListener('touchend', function(e) {
        if (e.target.tagName.toLowerCase() === 'canvas') return;
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipeGesture();
    }, { passive: true }); // <-- Thêm option này
}

function handleSwipeGesture() {
    // Chỉ kích hoạt khi đang ở màn hình làm bài
    if (practiceScreenEl.classList.contains('hidden')) return;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Tính toán: Phải là vuốt ngang (trục X) và khoảng cách vuốt > 60px
    if (absX > 60 && absX > absY) {
        if (deltaX < 0) {
            // 1. VUỐT TRÁI (Swipe Left) -> QUA CÂU TIẾP THEO
            if (isTestMode) {
                // Kiểm tra: Tự do lướt tới
                if (currentQuestionIndex < currentQuizQuestions.length - 1) {
                    currentQuestionIndex++; 
                    renderQuestion();
                }
            } else {
                // Luyện tập: BẮT BUỘC phải có nút Next (đã làm đúng) mới được lướt qua
                const nextBtn = document.getElementById('next-btn');
                if (nextBtn && !nextBtn.classList.contains('hidden')) {
                    nextBtn.click();
                }
            }
        } else {
            // 2. VUỐT PHẢI (Swipe Right) -> LÙI LẠI CÂU TRƯỚC
            // KHÓA HOÀN TOÀN TÍNH NĂNG NÀY NẾU KHÔNG PHẢI LÀ CHẾ ĐỘ KIỂM TRA
            if (isTestMode) {
                if (currentQuestionIndex > 0) {
                    currentQuestionIndex--; 
                    renderQuestion();
                }
            }
        }
    }
}

function openQuizFromParams() {
    const { subject, quizIndex, quizTitle } = getQueryParams();
    if (!subject) return;

    if (!db[subject]) {
        alert(`Môn học "${subject}" không tồn tại.`);
        goHome();
        return;
    }

    let targetQuizIndex = -1;
    if (quizIndex !== null) {
        const idx = parseInt(quizIndex);
        if (!isNaN(idx) && idx >= 0 && idx < db[subject].length) { targetQuizIndex = idx; }
    } else if (quizTitle) {
        targetQuizIndex = db[subject].findIndex(q => q.title === quizTitle);
    }

    if (targetQuizIndex === -1) {
        alert(`Không tìm thấy đề thi "${quizTitle || quizIndex}" trong môn ${subject}.`);
        goHome();
        return;
    }

    // =========================================================
    // KÍCH HOẠT CHẾ ĐỘ CÁCH LY
    // =========================================================
    isIsolatedMode = true; 
    currentSubject = subject;
    const quizData = db[subject][targetQuizIndex];

    const sidebar = document.getElementById('app-sidebar');
    const topbar = document.querySelector('.topbar');
    const bottomNav = document.getElementById('bottom-nav');
    if(sidebar) sidebar.style.display = 'none';
    if(topbar) topbar.style.display = 'none';
    if(bottomNav) bottomNav.style.display = 'none';

    const dashboard = document.getElementById('app-dashboard');
    if(dashboard) {
        dashboard.style.margin = '0';
        dashboard.style.width = '100vw';
        dashboard.style.height = '100vh';
        dashboard.style.borderRadius = '0';
        dashboard.style.border = 'none';
    }

    // =========================================================
    // BẢNG YÊU CẦU NHẬP TÊN (GUEST LOGIN)
    // =========================================================
    const overlay = document.createElement('div'); 
    overlay.className = 'mode-selection-overlay';
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:var(--bg-main); z-index:99999; display:flex; align-items:center; justify-content:center;";
    
    const box = document.createElement('div'); 
    box.style.cssText = "background:var(--card-bg); padding:35px; border-radius:16px; border:1px solid var(--border-color); text-align:center; max-width:400px; width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.9); animation: fadeInUp 0.4s ease;";
    
    // Kiểm tra xem trình duyệt có nhớ tên học sinh từ lần trước không
    const savedName = localStorage.getItem('studentName') || "";
    const savedClass = localStorage.getItem('studentClass') || "";
    
    box.innerHTML = `
        <div style="font-size: 40px; margin-bottom: 10px;">👋</div>
        <h3 style="margin-top:0; color:var(--primary); font-size:22px;">Chào mừng em!</h3>
        <p style="color:var(--text-muted); margin-bottom:20px; line-height:1.5;">Đề thi: <strong style="color:var(--text-main);">${quizData.title}</strong></p>
        
        <div style="text-align: left; margin-bottom: 25px;">
            <label style="font-size: 13px; font-weight: bold; color: var(--text-muted); margin-bottom: 5px; display: block;">Họ và tên của em:</label>
            <input type="text" id="guest-name" value="${savedName}" placeholder="Nhập họ và tên thật..." style="width:100%; padding: 14px; margin-bottom: 15px; border-radius: 8px; border: 2px solid var(--border-color); font-size: 16px; font-weight: bold; color: var(--primary); text-align: center;">
            
            <label style="font-size: 13px; font-weight: bold; color: var(--text-muted); margin-bottom: 5px; display: block;">Lớp (Tùy chọn):</label>
            <input type="text" id="guest-class" value="${savedClass}" placeholder="VD: 12A5..." style="width:100%; padding: 14px; border-radius: 8px; border: 2px solid var(--border-color); font-size: 16px; text-align: center;">
        </div>

        <div style="display:flex; flex-direction:column; gap:12px;">
            <button id="btn-mode-test" class="btn btn-primary" style="width:100%; justify-content:center; padding: 15px; font-size: 16px;">🚀 Vào Thi Ngay</button>
            <button id="btn-mode-practice" class="btn btn-secondary" style="width:100%; justify-content:center; border-color:var(--primary); color:var(--primary);">Chế độ Luyện Tập (Không tính điểm)</button>
        </div>
    `;
    
    overlay.appendChild(box); 
    document.body.appendChild(overlay);

    // Xử lý khi học sinh bấm Bắt đầu
    const handleStart = (isTest) => {
        const name = document.getElementById('guest-name').value.trim();
        const className = document.getElementById('guest-class').value.trim() || "Khách";
        
        if (!name) { 
            alert("⚠️ Vui lòng nhập Họ và tên của em để Giáo viên chấm điểm nhé!"); 
            document.getElementById('guest-name').focus();
            return; 
        }
        
        // CẬP NHẬT TÊN VÀO BỘ NHỚ: Khi hệ thống nộp bài, nó sẽ tự móc tên này ra gửi lên Sheet
        localStorage.setItem('studentName', name);
        localStorage.setItem('studentClass', className);
        
        document.body.removeChild(overlay); 
        startQuiz(targetQuizIndex, isTest);
    };

    document.getElementById('btn-mode-test').onclick = () => handleStart(true);
    document.getElementById('btn-mode-practice').onclick = () => handleStart(false);
}

function showQRCode(subject, quizIndex) {
    const quiz = db[subject][quizIndex];
    const baseUrl = window.location.origin + window.location.pathname;
    // Sử dụng quizTitle để ổn định hơn (encode để tránh lỗi ký tự đặc biệt)
    const shareUrl = `${baseUrl}?subject=${encodeURIComponent(subject)}&quizTitle=${encodeURIComponent(quiz.title)}`;
    
    // Tạo modal
    const overlay = document.createElement('div');
    overlay.className = 'qr-modal-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6); z-index: 100000;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(5px);
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: var(--card-bg); padding: 30px; border-radius: 24px;
        border: 1px solid var(--border-color); text-align: center;
        max-width: 350px; width: 90%; box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    `;
    modal.innerHTML = `
        <h3 style="margin-top:0; color: var(--primary);">Quét mã QR để làm bài</h3>
        <p style="font-size:14px; color: var(--text-muted);">${quiz.title}</p>
        <div id="qrcode-container" style="background: white; padding: 15px; border-radius: 16px; display: inline-block; margin: 15px 0;">
            <!-- Canvas QR sẽ được tạo ở đây -->
        </div>
        <p style="font-size:12px; word-break: break-all; color: var(--text-muted);">${shareUrl}</p>
        <button class="btn btn-primary" style="margin-top:15px; width:100%;" onclick="this.closest('.qr-modal-overlay').remove()">Đóng</button>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // --- BẮT ĐẦU ĐOẠN CODE CẦN THAY THẾ ---
    const container = modal.querySelector('#qrcode-container');
    container.innerHTML = ""; // Xóa nội dung cũ (nếu có) để tránh lỗi trùng lặp

    if (typeof QRCode !== 'undefined') {
        // Cách 1: Dùng thư viện qrcode.js (Ưu tiên vì chạy Offline được)
        new QRCode(container, {
            text: shareUrl,
            width: 220,
            height: 220,
            colorDark: "#0F4D5F", // Đổi màu QR khớp với tông màu Primary của web em
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.L // Giảm mức độ sửa lỗi xuống L (Low) để chứa được URL siêu dài
        });
    } else {
        // Cách 2: Fallback bằng API hiện đại hơn (Nếu thư viện lỗi)
        // Dùng api.qrserver.com thay cho Google Charts vì nó ổn định hơn với URL dài
        const img = document.createElement('img');
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(shareUrl)}`;
        img.alt = "Mã QR Bài Tập";
        img.style.borderRadius = "8px";
        container.appendChild(img);
    }
    // --- KẾT THÚC ĐOẠN CODE CẦN THAY THẾ ---
    
    // Click overlay để đóng
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

/* ==========================================================================
   MODULE ĐỘC LẬP: SƠ ĐỒ TƯ DUY AI (MINDMAP)
   Sử dụng: Gemini API (Trực tiếp qua fetch) + Markmap library
========================================================================== */
let mm_markmapInstance = null;
let mm_currentMarkdown = "";

function mm_openMindmap() {
    showScreen('screen-mindmap');
    document.getElementById('app-title').innerText = "Sơ Đồ Tư Duy AI";
}

async function mm_generateMindmap() {
    const keyword = document.getElementById('mm-keyword').value.trim();
    const context = document.getElementById('mm-context').value.trim();
    const btn = document.getElementById('mm-btn-generate');
    
    // API Key chuẩn của bạn
    const apiKey = "AIzaSyDpfjDpH4bmPzZDdRslETm2w7ojSweRP-g"; 
    
    if (!keyword && !context) {
        alert("Vui lòng nhập Từ khóa hoặc dán Tài liệu để AI phân tích!");
        return;
    }

    btn.innerText = "⏳ Đang phân tích... (Khoảng 5-10s)";
    btn.disabled = true;
    document.getElementById('mm-placeholder').innerHTML = `<div class="loader">Đang vắt óc suy nghĩ...</div>`;

    let promptText = `Bạn là chuyên gia giáo dục. Hãy tạo Sơ đồ tư duy dạng Markdown phân cấp (dùng thẻ #, ##, ###, -) dựa trên thông tin sau.
YÊU CẦU BẮT BUỘC: 
- Chỉ trả về ĐÚNG MỘT khối mã Markdown, không giải thích gì thêm, không chào hỏi.
- Phải dùng dấu # cho gốc (Root) và phân nhánh ít nhất 3 tầng.
- Tóm tắt cực kỳ ngắn gọn, dễ hiểu.

THÔNG TIN ĐẦU VÀO:
- Chủ đề/Từ khóa: ${keyword || 'Phân tích tài liệu bên dưới'}
- Tài liệu (nếu có): ${context}`;

    // NÂNG CẤP: Tính năng tự động thử lại tối đa 3 lần nếu máy chủ bận
    let maxRetries = 3;
    let aiText = "";
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            if (i > 0) {
                btn.innerText = `⏳ Máy chủ đang bận, đang thử lại lần ${i + 1}/3...`;
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: promptText }] }],
                    generationConfig: { temperature: 0.3 } 
                })
            });

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.message);
            }

            // Nếu thành công, thoát khỏi vòng lặp thử lại
            aiText = data.candidates[0].content.parts[0].text;
            break; 

        } catch (error) {
            // Nếu là lỗi quá tải và chưa thử hết số lần
            if (error.message.includes("high demand") && i < maxRetries - 1) {
                console.log(`Lần ${i+1} thất bại do nghẽn mạng, chờ 2s để thử lại...`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Chờ 2 giây trước khi thử lại
            } else {
                // Nếu là lỗi khác, hoặc đã hết 3 lần thử thì báo lỗi thật
                console.error("AI Error:", error);
                alert("❌ Lỗi AI: " + error.message);
                document.getElementById('mm-placeholder').innerHTML = `<p style="color:var(--danger)">Có lỗi xảy ra khi gọi AI.</p>`;
                btn.innerText = "🚀 TẠO SƠ ĐỒ";
                btn.disabled = false;
                return; // Dừng hàm hoàn toàn
            }
        }
    }

    // Dọn dẹp và vẽ sơ đồ nếu lấy được text thành công
    if (aiText) {
        aiText = aiText.replace(/```markdown/gi, '').replace(/```/g, '').trim();
        mm_currentMarkdown = aiText;
        mm_renderSVG(mm_currentMarkdown);
        
        document.getElementById('mm-placeholder').classList.add('hidden');
        document.getElementById('mm-btn-export').classList.remove('hidden');
    }

    btn.innerText = "🚀 TẠO SƠ ĐỒ";
    btn.disabled = false;
}

function mm_renderSVG(markdownStr) {
    const { Markmap, loadCSS, loadJS, Transformer } = window.markmap;
    const transformer = new Transformer();
    const { root, features } = transformer.transform(markdownStr);
    const { styles, scripts } = transformer.getUsedAssets(features);
    
    // Tải style/script phụ trợ của Markmap nếu cần
    if (styles) loadCSS(styles);
    if (scripts) loadJS(scripts, { getMarkmap: () => window.markmap });

    const svgEl = document.querySelector('#mm-svg');
    svgEl.innerHTML = ""; // Xóa sơ đồ cũ

    // Khởi tạo mới hoặc update
    if (mm_markmapInstance) {
        mm_markmapInstance.destroy();
    }
    
    mm_markmapInstance = Markmap.create(svgEl, {
        autoFit: true,
        color: () => getComputedStyle(document.body).getPropertyValue('--primary').trim(),
        duration: 500, // Tốc độ hoạt ảnh mở nhánh
        paddingX: 50
    }, root);
    
    // Auto zoom fit sau khi vẽ
    setTimeout(() => mm_markmapInstance.fit(), 300);
}

// =======================================================
// TÍNH NĂNG: XUẤT RA FILE HTML TƯƠNG TÁC (CÓ DÀN Ý RỄ CÂY & IN ĐẬM MARKDOWN)
// =======================================================
function mm_exportHTML() {
    if (!mm_currentMarkdown) return;
    
    const title = document.getElementById('mm-keyword').value.trim() || "So_Do_Tu_Duy_AI";
    
    const safeMarkdown = mm_currentMarkdown
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Sơ đồ tư duy</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;900&display=swap');
        
        body, html { 
            margin: 0; padding: 0; 
            background-color: #f8fafc; 
            font-family: 'Nunito', 'Segoe UI', sans-serif; 
            height: 100vh; overflow: hidden;
        }
        body.is-map { background-image: radial-gradient(#cbd5e1 1.5px, transparent 1.5px); background-size: 25px 25px; }
        
        .header { 
            background: linear-gradient(135deg, #0F4D5F, #3b82f6); 
            color: white; padding: 15px 30px; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 10;
            display: flex; justify-content: space-between; align-items: center;
            height: 40px; position: relative;
        }
        .header h1 { margin: 0; font-size: 22px; font-weight: 900; letter-spacing: 0.5px; }
        
        .toolbar { display: flex; gap: 10px; align-items: center; }
        .btn { background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.4); padding: 8px 15px; border-radius: 8px; cursor: pointer; font-weight: bold; font-family: inherit; transition: 0.2s; font-size: 14px; }
        .btn:hover, .btn.active { background: white; color: #0F4D5F; }
        .btn-print { background: #10b981; border-color: #10b981; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3); }
        .btn-print:hover { background: #059669; color: white; transform: translateY(-2px); }
        
        #view-map { width: 100%; height: calc(100vh - 70px); display: block; }
        svg { width: 100%; height: 100%; cursor: grab; }
        svg:active { cursor: grabbing; }
        .markmap-node text { font-family: 'Nunito', sans-serif !important; font-weight: 700 !important; fill: #1e293b !important; font-size: 18px !important; }
        .markmap-link { stroke-width: 2.5px !important; }

        /* GIAO DIỆN BẢNG DÀN Ý - DẠNG RỄ CÂY */
        #view-table { width: 100%; height: calc(100vh - 70px); overflow-y: auto; display: none; padding: 40px 0; box-sizing: border-box; }
        .mm-table { width: 90%; max-width: 900px; margin: 0 auto; position: relative; }
        
        .mm-row { 
            position: relative; padding: 12px 20px; margin-bottom: 12px; 
            border-radius: 12px; background: white; border: 1px solid #e2e8f0; 
            line-height: 1.6; box-shadow: 0 2px 8px rgba(0,0,0,0.03); 
            page-break-inside: avoid;
        }

        .level-1 { font-size: 24px; font-weight: 900; background: linear-gradient(135deg, #0F4D5F, #1e293b); color: white; text-align: center; border: none; margin-bottom: 30px; box-shadow: 0 10px 20px rgba(15, 77, 95, 0.2); }
        .level-2 { margin-left: 0; border-left: 6px solid #0284c7; background: #f0f9ff; color: #0369a1; font-size: 18px; font-weight: 800; margin-top: 25px; }
        .level-3 { margin-left: 40px; font-size: 16px; font-weight: 700; color: #b45309; }
        .level-4 { margin-left: 80px; font-size: 15px; font-weight: 500; color: #334155; }
        .level-5 { margin-left: 120px; font-size: 14px; font-weight: 500; color: #475569; }

        /* HIỆU ỨNG RỄ CÂY */
        .level-3::before, .level-4::before, .level-5::before {
            content: ''; position: absolute; left: -24px; top: -15px; 
            width: 16px; height: 38px; border-left: 2px solid #cbd5e1; 
            border-bottom: 2px solid #cbd5e1; border-bottom-left-radius: 8px; z-index: -1;
        }

        @media print {
            @page { margin: 15mm; }
            body, html { height: auto !important; overflow: visible !important; background: white !important; }
            .header { display: none !important; }
            .mm-table { width: 100%; max-width: 100%; }
            .mm-row { box-shadow: none; border: 1px solid #94a3b8; }
            .level-1 { background: #000; color: #fff; border: 2px solid #000; }
            .level-2 { background: #f8fafc; border-left: 6px solid #000; color: #000; }
            .level-3, .level-4, .level-5 { color: #000; }
            .level-3::before, .level-4::before, .level-5::before { border-color: #000; }

            body.is-map #view-map { display: block !important; height: 100vh !important; }
            body.is-map #view-table { display: none !important; }
            body.is-map svg { width: 100vw !important; height: 100vh !important; transform-origin: center center !important; }
            body.is-map .markmap-node text { fill: #000 !important; font-weight: 900 !important; }
            body.is-table #view-table { display: block !important; height: auto !important; padding: 0 !important;}
            body.is-table #view-map { display: none !important; }
        }
    </style>
</head>
<body class="is-map">
    <div class="header">
        <h1>📚 ${title}</h1>
        <div class="toolbar">
            <button id="btn-map" class="btn active" onclick="switchMode('map')">👁️ Sơ Đồ Tư Duy</button>
            <button id="btn-table" class="btn" onclick="switchMode('table')">📋 Bảng Rễ Cây (Dễ In)</button>
            <div style="width: 2px; height: 20px; background: rgba(255,255,255,0.3); margin: 0 10px;"></div>
            <button class="btn btn-print" onclick="printDoc()">🖨️ In Bản Đang Xem</button>
        </div>
    </div>
    
    <div id="view-map"><svg id="markmap-svg"></svg></div>
    <div id="view-table"><div id="table-container"></div></div>
    <textarea id="md-data" style="display:none;">${safeMarkdown}</textarea>

    <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
    <script src="https://cdn.jsdelivr.net/npm/markmap-lib"></script>
    <script src="https://cdn.jsdelivr.net/npm/markmap-view"></script>
    
    <script>
        let mmInstance;
        window.onload = () => {
            const markdown = document.getElementById('md-data').value;
            const { Markmap, loadCSS, loadJS, Transformer } = window.markmap;
            const transformer = new Transformer();
            const { root, features } = transformer.transform(markdown);
            const { styles, scripts } = transformer.getUsedAssets(features);
            if (styles) loadCSS(styles);
            if (scripts) loadJS(scripts, { getMarkmap: () => window.markmap });
            mmInstance = Markmap.create(document.getElementById('markmap-svg'), { autoFit: true, duration: 500, paddingX: 50 }, root);
            setTimeout(() => mmInstance.fit(), 300);
            renderTable(markdown);
        };

        function renderTable(md) {
            // Bộ dịch In đậm/In nghiêng siêu an toàn (Không dùng Regex để tránh lỗi)
            const parseFormatting = (text) => {
                let res = text;
                while (res.indexOf('**') !== -1 && res.indexOf('**', res.indexOf('**') + 2) !== -1) {
                    res = res.replace('**', '<strong style="color: #0F4D5F; font-weight: 900;">').replace('**', '</strong>');
                }
                while (res.indexOf('*') !== -1 && res.indexOf('*', res.indexOf('*') + 1) !== -1) {
                    res = res.replace('*', '<em style="color: #0284c7;">').replace('*', '</em>');
                }
                return res;
            };

            const lines = md.split('\\n');
            let html = '<div class="mm-table">';
            
            lines.forEach(line => {
                let rawLine = line; 
                let t = line.trim();
                if(!t) return;
                
                let formattedText = parseFormatting(t);

                if (t.startsWith('# ')) {
                    html += '<div class="mm-row level-1">📌 ' + parseFormatting(t.substring(2)) + '</div>';
                } else if (t.startsWith('## ')) {
                    html += '<div class="mm-row level-2">🔹 ' + parseFormatting(t.substring(3)) + '</div>';
                } else if (t.startsWith('### ')) {
                    html += '<div class="mm-row level-3">🔸 ' + parseFormatting(t.substring(4)) + '</div>';
                } else if (t.startsWith('#### ')) {
                    html += '<div class="mm-row level-4">▪️ ' + parseFormatting(t.substring(5)) + '</div>';
                } else if (t.startsWith('- ') || t.startsWith('* ')) {
                    let leadingSpaces = rawLine.search(/\\S/); 
                    let content = parseFormatting(t.substring(2));
                    if (leadingSpaces === 0) {
                        html += '<div class="mm-row level-4">▪️ ' + content + '</div>';
                    } else {
                        html += '<div class="mm-row level-5">▫️ ' + content + '</div>';
                    }
                } else {
                    html += '<div class="mm-row level-5">' + formattedText + '</div>';
                }
            });
            html += '</div>';
            document.getElementById('table-container').innerHTML = html;
        }

        function switchMode(mode) {
            document.body.className = 'is-' + mode;
            document.getElementById('view-map').style.display = mode === 'map' ? 'block' : 'none';
            document.getElementById('view-table').style.display = mode === 'table' ? 'block' : 'none';
            document.getElementById('btn-map').classList.toggle('active', mode === 'map');
            document.getElementById('btn-table').classList.toggle('active', mode === 'table');
            if(mode === 'map' && mmInstance) { setTimeout(() => mmInstance.fit(), 100); }
        }

        function printDoc() {
            const isMap = document.body.classList.contains('is-map');
            if (isMap && mmInstance) {
                mmInstance.fit().then(() => setTimeout(() => window.print(), 400));
            } else { window.print(); }
        }
    </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}_Mindmap.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// =======================================================
// TÍNH NĂNG: HIỂN THỊ TRỰC TIẾP TỪ MÃ MARKDOWN (MIỄN PHÍ)
// =======================================================
function mm_renderDirect() {
    const context = document.getElementById('mm-context').value.trim();
    if (!context) {
        alert("Hãy dán đoạn mã Markdown vào ô nội dung!");
        return;
    }
    
    // Lưu nội dung vào biến toàn cục để có thể xuất file HTML sau này
    mm_currentMarkdown = context; 
    
    // Gọi hàm vẽ sơ đồ đã có sẵn của bạn
    mm_renderSVG(mm_currentMarkdown);
    
    // Hiện nút xuất file và ẩn ảnh nền chờ
    document.getElementById('mm-placeholder').classList.add('hidden');
    document.getElementById('mm-btn-export').classList.remove('hidden');
}

// =======================================================
// TÍNH NĂNG: SOẠN THẢO MARKDOWN BẰNG NÚT BẤM
// =======================================================
function mm_insertMD(syntax) {
    const textarea = document.getElementById('mm-context');
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const text = textarea.value;
    
    // Nếu chưa có dấu thăng (#) nào ở đầu văn bản và người dùng bấm nút Nhánh, tự động thêm Gốc trước
    if (syntax !== '# ' && text.trim() === '') {
        syntax = '# Chủ đề chính\n' + syntax;
    }

    // Chèn mã Markdown vào đúng vị trí con trỏ chuột
    textarea.value = text.substring(0, startPos) + syntax + text.substring(endPos);
    
    // Đưa con trỏ chuột về đúng vị trí để gõ tiếp
    const newCursorPos = startPos + syntax.length;
    textarea.focus();
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    
    // Kích hoạt vẽ ngay lập tức
    mm_livePreview();
}

// =======================================================
// TÍNH NĂNG: VẼ SƠ ĐỒ THEO THỜI GIAN THỰC (LIVE PREVIEW)
// =======================================================
let mm_typingTimer;
function mm_livePreview() {
    clearTimeout(mm_typingTimer);
    
    // Chờ người dùng dừng gõ 0.5 giây rồi mới vẽ để tránh giật lag trình duyệt
    mm_typingTimer = setTimeout(() => {
        const context = document.getElementById('mm-context').value.trim();
        if (context) {
            mm_currentMarkdown = context;
            mm_renderSVG(mm_currentMarkdown);
            
            document.getElementById('mm-placeholder').classList.add('hidden');
            document.getElementById('mm-btn-export').classList.remove('hidden');
        } else {
            // Nếu xóa trắng ô text, quay về ảnh nền chờ
            document.querySelector('#mm-svg').innerHTML = '';
            document.getElementById('mm-placeholder').classList.remove('hidden');
            document.getElementById('mm-btn-export').classList.add('hidden');
        }
    }, 500); 
}

/* ==========================================================================
   TÍNH NĂNG IN KẾT QUẢ SAU THI (CHUẨN GIẤY A4)
========================================================================== */
function printQuizResult() {
    const hsName = localStorage.getItem('studentName') || "Học sinh ẩn danh";
    const hsClass = localStorage.getItem('studentClass') || "Không rõ";
    const quizTitle = db[currentSubject][currentQuizIndex].title;
    const dateStr = new Date().toLocaleString('vi-VN');

    // Đếm tổng số câu hỏi thực tế (như thuật toán lúc chấm điểm)
    let totalRealQuestions = 0;
    currentQuizQuestions.forEach(q => {
        if (q.type === 'reading-cluster') {
            q.questions.forEach(sq => { if (sq.type !== 'writing') totalRealQuestions += 1; });
        } else if (q.type !== 'writing') { totalRealQuestions += 1; }
    });

    const scoreString = `${sessionCorrectCount} / ${totalRealQuestions}`;

    // XÂY DỰNG PHẦN TIÊU ĐỀ (HEADER)
    let html = `
        <div class="print-header" style="text-align: center; margin-bottom: 30px;">
            <h2 style="margin: 0; font-size: 20pt; text-transform: uppercase;">KẾT QUẢ BÀI LÀM</h2>
            <h3 style="margin: 5px 0 15px 0; font-size: 16pt;">${quizTitle}</h3>
            <table style="width: 100%; text-align: left; font-size: 13pt; margin-top: 15px; border-collapse: collapse;">
                <tr>
                    <td style="width: 60%;"><strong>Họ và tên:</strong> ${hsName}</td>
                    <td style="width: 40%; text-align: right;"><strong>Môn học:</strong> ${currentSubject}</td>
                </tr>
                <tr>
                    <td><strong>Lớp:</strong> ${hsClass}</td>
                    <td style="text-align: right;"><strong>Ngày làm:</strong> ${dateStr}</td>
                </tr>
                <tr>
                    <td colspan="2" style="text-align: center; padding-top: 15px; font-size: 16pt;">
                        <strong>Điểm số:</strong> <span style="font-size: 20pt; font-weight: bold;">${scoreString}</span>
                    </td>
                </tr>
            </table>
            <hr style="border: 1.5px solid black; margin-top: 20px;">
        </div>
        <div style="font-size: 12pt; line-height: 1.5;">
            <h3 style="text-transform: uppercase; font-size: 14pt; margin-bottom: 15px;">Chi tiết đáp án:</h3>
    `;

    // XÂY DỰNG PHẦN NỘI DUNG TỪNG CÂU HỎI
    sessionResultList.forEach((item) => {
        html += `<div style="margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px dashed #ccc; break-inside: avoid; page-break-inside: avoid;">`;

        if (item.type === 'reading-cluster') {
            html += `<div style="margin-bottom: 15px;"><strong>[Ngữ liệu / Bài đọc]:</strong><div style="border: 1px solid #000; padding: 15px; margin-top: 8px; text-align: justify; border-radius: 4px;">${formatText(item.context)}</div></div>`;
            item.subQuestions.forEach(sq => {
                html += generateSingleResultPrintHTML(sq);
            });
        } else {
            html += generateSingleResultPrintHTML(item);
        }

        html += `</div>`;
    });

    html += `</div>`;

    // Đổ nội dung vào vùng In ẩn và gọi lệnh Print của hệ điều hành
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = html;

    // Render lại công thức toán học trước khi in (Nếu có)
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise([printArea]).then(() => { window.print(); }).catch(err => { window.print(); });
    } else {
        window.print();
    }
}

function generateSingleResultPrintHTML(q) {
    let h = `<div style="margin-bottom: 15px;">`;
    let icon = q.isCorrect ? "[✔️ ĐÚNG]" : "[❌ SAI]";
    if (q.type === 'writing') icon = "[✍️ TỰ LUẬN]";

    h += `<div style="font-weight: bold; margin-bottom: 8px;">${icon} Câu ${q.questionNum}: ${formatText(q.content)}</div>`;

    if (q.type === 'writing') {
        h += `<div style="margin-left: 20px; margin-bottom: 8px;"><strong>Bài làm:</strong><br>${q.userAnswer || 'Không có nội dung'}</div>`;
    } else if (q.type === 'short-answer') {
        h += `<div style="margin-left: 20px; margin-bottom: 8px;">
                <strong>Đã điền:</strong> ${q.userAnswer || 'Bỏ trống'}<br>
                <strong>Đáp án đúng:</strong> ${cleanOpt(q.correctAnswer)}
              </div>`;
    } else if (q.type === 'cluster-tf') {
        h += `<table style="width:95%; border-collapse: collapse; margin-left: 20px; margin-bottom: 8px;" border="1">
                <tr><th style="padding:6px; text-align: left;">Mệnh đề</th><th style="padding:6px; width: 100px; text-align:center;">Đã chọn</th><th style="padding:6px; width: 100px; text-align:center;">Đáp án</th></tr>`;
        q.statements.forEach((stmt, j) => {
            let uA = q.userAnswer ? q.userAnswer[j] : "";
            let cA = stmt.correctAnswer;
            h += `<tr>
                    <td style="padding:6px;">${formatText(stmt.text)}</td>
                    <td style="padding:6px; text-align:center;">${uA || '-'}</td>
                    <td style="padding:6px; text-align:center; font-weight:bold;">${cA}</td>
                  </tr>`;
        });
        h += `</table>`;
    } else if (q.options) {
        h += `<div style="margin-left: 20px; margin-bottom: 8px;">`;
        const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
        q.options.forEach((opt, idx) => {
            let cleanO = cleanOpt(opt);
            let isCorrectOpt = cleanO === cleanOpt(q.correctAnswer);
            let isSelected = q.userAnswer && cleanOpt(q.userAnswer) === cleanO;

            let marker = ""; let decoration = "";
            if (isCorrectOpt) { marker = " <strong>[✔️ ĐÁP ÁN]</strong>"; }
            if (isSelected && !isCorrectOpt) { marker = " <strong>[❌ BẠN CHỌN]</strong>"; decoration = "text-decoration: line-through;"; }
            if (isSelected && isCorrectOpt) { marker = " <strong>[✔️ BẠN CHỌN ĐÚNG]</strong>"; }

            h += `<div style="padding: 4px 0; ${decoration}"><strong>${labels[idx]}.</strong> ${cleanO}${marker}</div>`;
        });
        h += `</div>`;
    }

    if (q.explanation) {
        h += `<div style="margin-left: 20px; font-style: italic; border-left: 3px solid #ccc; padding-left: 10px; margin-top: 10px;"><strong>Giải thích:</strong> ${formatText(q.explanation)}</div>`;
    }

    h += `</div>`;
    return h;
}

/* ==========================================================================
   TÍNH NĂNG CHIA SẺ MÃ QR VÀ LINK CHO GAME TỪ VỰNG
========================================================================== */
function shareVocabQR() {
    const topic = document.getElementById('vocab-topic-select').value;
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?vocabTopic=${encodeURIComponent(topic)}`;
    
    const overlay = document.createElement('div');
    overlay.className = 'qr-modal-overlay';
    overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 100000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);`;
    
    const modal = document.createElement('div');
    modal.style.cssText = `background: var(--card-bg); padding: 30px; border-radius: 24px; border: 1px solid var(--border-color); text-align: center; max-width: 350px; width: 90%; box-shadow: 0 20px 40px rgba(0,0,0,0.5);`;
    
    let topicName = topic === 'ALL' ? 'Tất cả từ vựng' : `Chủ đề: ${topic}`;
    modal.innerHTML = `
        <h3 style="margin-top:0; color: var(--primary);">Quét QR để Luyện Từ Vựng</h3>
        <p style="font-size:14px; color: var(--text-muted);">${topicName}</p>
        <div id="vocab-qrcode-container" style="background: white; padding: 15px; border-radius: 16px; display: inline-block; margin: 15px 0;"></div>
        <p style="font-size:12px; word-break: break-all; color: var(--text-muted);">${shareUrl}</p>
        <button class="btn btn-primary" style="margin-top:15px; width:100%;" onclick="this.closest('.qr-modal-overlay').remove()">Đóng</button>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const container = modal.querySelector('#vocab-qrcode-container');
    if (typeof QRCode !== 'undefined') {
        new QRCode(container, { text: shareUrl, width: 220, height: 220, colorDark: "#0F4D5F", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L });
    } else {
        const img = document.createElement('img');
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(shareUrl)}`;
        img.style.borderRadius = "8px";
        container.appendChild(img);
    }
    
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function openVocabGameFromParams() {
    const params = new URLSearchParams(window.location.search);
    const topic = params.get('vocabTopic');

    if (!db.Vocabulary || db.Vocabulary.length === 0) {
        alert("Kho từ vựng trống."); goHome(); return;
    }

    // Cách ly giao diện (Tắt menu, bật toàn màn hình)
    isIsolatedMode = true;
    document.getElementById('app-sidebar').style.display = 'none';
    document.querySelector('.topbar').style.display = 'none';
    const bottomNav = document.getElementById('bottom-nav');
    if(bottomNav) bottomNav.classList.add('hide-nav');
    
    const dashboard = document.getElementById('app-dashboard');
    if(dashboard) {
        dashboard.style.margin = '0'; dashboard.style.width = '100vw'; dashboard.style.height = '100vh'; dashboard.style.borderRadius = '0'; dashboard.style.border = 'none';
    }

    // Gọi bảng chọn chế độ thông minh cho chủ đề này
    showIsolatedVocabMenu(topic);
}

// HÀM MỚI: Tạo bảng chọn chế độ bất tử (Dùng lúc mới vào link và lúc đóng Flashcard)
function showIsolatedVocabMenu(topic) {
    // Xóa overlay cũ nếu còn sót để tránh trùng lặp giao diện
    const oldOverlay = document.getElementById('vocab-isolated-overlay');
    if (oldOverlay) oldOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vocab-isolated-overlay';
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:var(--bg-main); z-index:99999; display:flex; align-items:center; justify-content:center;";
    
    const box = document.createElement('div');
    box.style.cssText = "background:var(--card-bg); padding:35px; border-radius:16px; border:1px solid var(--border-color); text-align:center; max-width:400px; width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.9); animation: fadeInUp 0.4s ease;";

    // --- ĐÃ FIX: Bọc try-catch khi đọc tên học sinh ---
    let savedName = "";
    try {
        savedName = localStorage.getItem('studentName') || "";
    } catch (e) {
        console.log("iPhone chặn đọc localStorage, hiển thị như người dùng mới.");
    }
    // ------------------------------------------------

    // Xử lý logic hiển thị: Nếu chưa có tên thì bắt nhập, nếu có rồi thì hiển thị lời chào
    let nameSectionHtml = "";
    if (!savedName) {
        nameSectionHtml = `
            <div style="text-align: left; margin-bottom: 25px;">
                <label style="font-size: 13px; font-weight: bold; color: var(--text-muted); margin-bottom: 5px; display: block;">Họ và tên của em:</label>
                <input type="text" id="guest-name" value="" placeholder="Nhập họ và tên thật..." style="width:100%; padding: 14px; margin-bottom: 15px; border-radius: 8px; border: 2px solid var(--border-color); font-size: 16px; font-weight: bold; color: var(--primary); text-align: center;">
            </div>
        `;
    } else {
        nameSectionHtml = `
            <p style="color:var(--text-main); font-weight: bold; margin-bottom: 25px; font-size: 16px;">Chào mừng em quay lại, <span style="color:var(--primary); text-decoration: underline;">${savedName}</span>! 👋</p>
        `;
    }

    box.innerHTML = `
        <div style="font-size: 40px; margin-bottom: 10px;">🎮</div>
        <h3 style="margin-top:0; color:var(--primary); font-size:22px;">Luyện Tập Từ Vựng</h3>
        <p style="color:var(--text-muted); margin-bottom:20px; line-height:1.5;">Chủ đề: <strong style="color:var(--text-main);">${topic === 'ALL' ? 'Tất cả' : topic}</strong></p>
        
        ${nameSectionHtml}

        <div style="display:flex; flex-direction:column; gap:12px;">
            <button id="btn-flashcard-guest" class="btn btn-secondary" style="width:100%; justify-content:center; padding: 15px; font-size: 16px; border-color: var(--primary); color: var(--primary); font-weight: bold;">📖 Flashcard</button>
            <button id="btn-start-vocab-guest" class="btn btn-primary" style="width:100%; justify-content:center; padding: 15px; font-size: 16px;">🚀 Luyện tập</button>
        </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Hàm kiểm tra tên trước khi vào học
    const verifyAndContinue = () => {
        // --- ĐÃ FIX: Chống crash khi kiểm tra và lưu tên ---
        if (!savedName) {
            const inputElement = document.getElementById('guest-name');
            if (inputElement) {
                const inputName = inputElement.value.trim();
                if (!inputName) {
                    alert("⚠️ Vui lòng nhập tên của em nhé!");
                    inputElement.focus();
                    return false;
                }
                try {
                    localStorage.setItem('studentName', inputName);
                } catch(e) {
                    console.log("iPhone chặn lưu tên.");
                }
            }
        }
        // ------------------------------------------------
        
        overlay.remove(); // Xóa bảng chọn mode để vào bài
        return true;
    };

    // Sự kiện chọn chế độ Quiz Game
    document.getElementById('btn-start-vocab-guest').onclick = () => {
        if (verifyAndContinue()) {
            openVocabGame();
            setTimeout(() => {
                const select = document.getElementById('vocab-topic-select');
                if (select) { select.value = topic; startVocabGame(); }
            }, 100);
        }
    };

    // Sự kiện chọn chế độ Flashcard
    document.getElementById('btn-flashcard-guest').onclick = () => {
        if (verifyAndContinue()) {
            openVocabGame(); // Chạy nền cấu hình gốc
            setTimeout(() => {
                const select = document.getElementById('vocab-topic-select');
                if (select) { select.value = topic; openFlashcardMode(); }
            }, 100);
        }
    };
}

/* ==========================================================================
   TÍNH NĂNG IN TỪ VỰNG (ĐÃ TỐI ƯU GIAO DIỆN & QR CODE)
========================================================================== */
function openPrintVocabModal() {
    if (!db.Vocabulary || db.Vocabulary.length === 0) {
        alert("⚠️ Kho từ vựng đang trống! Bạn cần thêm từ vựng trước khi in.");
        return;
    }

    const topics = [...new Set(db.Vocabulary.map(v => v.topic || 'Chung'))];
    
    const overlay = document.createElement('div');
    overlay.id = 'vocab-print-modal';
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:999999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(5px);";

    const box = document.createElement('div');
    box.style.cssText = "background:var(--card-bg); padding:25px; border-radius:16px; border:1px solid var(--border-color); width:90%; max-width:400px; text-align:left; animation: fadeInUp 0.3s ease;";

    let optionsHtml = `<option value="ALL">🌟 In Toàn bộ kho từ vựng</option>`;
    topics.forEach(t => { optionsHtml += `<option value="${t}">📁 Chủ đề: ${t}</option>`; });

    box.innerHTML = `
        <h3 style="margin-top:0; color:var(--text-main); font-size:22px; text-align:center; margin-bottom: 15px;">🖨️ In Danh Sách Từ Vựng</h3>
        <p style="color:var(--text-muted); font-size:14px; margin-bottom: 15px;">Chọn chủ đề bạn muốn xuất ra bản in PDF / Giấy A4:</p>
        <select id="print-vocab-topic" style="width: 100%; border-color: var(--primary); margin-bottom: 25px; padding: 10px; border-radius: 8px; font-size: 16px;">
            ${optionsHtml}
        </select>
        <div style="display:flex; gap:10px;">
            <button class="btn btn-secondary" style="flex:1; justify-content:center;" onclick="document.getElementById('vocab-print-modal').remove()">Hủy</button>
            <button class="btn btn-primary" style="flex:1; justify-content:center;" onclick="executePrintVocab()">Tiến hành In</button>
        </div>
    `;
    
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

function executePrintVocab() {
    try {
        const topic = document.getElementById('print-vocab-topic').value;
        const modal = document.getElementById('vocab-print-modal');
        if (modal) modal.remove(); 
        
        let listToPrint = topic === "ALL" ? db.Vocabulary : db.Vocabulary.filter(v => (v.topic || 'Chung') === topic);
        
        listToPrint.sort((a, b) => {
            const levels = { 'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6, 'None': 7 };
            const types = { 'word': 1, 'phrase': 2, 'collo': 3 };
            let lvlA = levels[a.level || 'None'] || 7; 
            let lvlB = levels[b.level || 'None'] || 7;
            if (lvlA !== lvlB) return lvlA - lvlB;
            let typeA = types[a.type || 'word'] || 1;
            let typeB = types[b.type || 'word'] || 1;
            if (typeA !== typeB) return typeA - typeB;
            return (a.en || "").toLowerCase().localeCompare((b.en || "").toLowerCase(), 'en', { sensitivity: 'base' });
        });

        const shareUrl = `${window.location.origin}${window.location.pathname}?vocabTopic=${encodeURIComponent(topic)}`;

        // HÀM TẠO CỬA SỔ TÀNG HÌNH VÀ IN (CÁCH LY HOÀN TOÀN KHỎI WEB)
        const doPrint = (qrDataUrl) => {
            let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>In Từ Vựng</title>
                <style>
                    body { font-family: "Arial", sans-serif; color: #000; padding: 20px; background: #fff; margin: 0; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th, td { border: 1px solid #000; padding: 6px 8px; font-size: 12pt; }
                    .level-header { background-color: #334155 !important; color: #fff !important; font-weight: bold; text-align: center; font-size: 13pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .type-header { background-color: #f1f5f9 !important; font-style: italic; font-weight: bold; text-align: center; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .en-word { color: #00008B !important; font-size: 13pt; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    @media print {
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    }
                </style>
            </head>
            <body>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 15px;">
                    <div style="width:100px;"></div>
                    <div style="flex:1; text-align:center;">
                        <h2 style="margin:0; font-size:18pt;">TÀI LIỆU ÔN TẬP TỪ VỰNG</h2>
                        <h3 style="margin:5px 0; font-size:14pt;">${topic === "ALL" ? "TOÀN BỘ KHO TỪ" : topic.toUpperCase()}</h3>
                        <p style="font-size:11pt; margin:0; font-style:italic;">Tổng số: ${listToPrint.length} từ vựng</p>
                    </div>
                    <div style="width:100px; text-align:center;">
                        <img src="${qrDataUrl}" style="width:80px; height:80px; border:1px solid #000; padding:2px;">
                        <div style="font-size:9pt; font-weight:bold; margin-top:4px;">QUÉT ĐỂ CHƠI</div>
                    </div>
                </div>
                <hr style="border:1px solid #000; margin-bottom: 15px;">
                <table>
                    <thead>
                        <tr style="background-color:#e2e8f0; -webkit-print-color-adjust:exact;">
                            <th style="width:50px;">STT</th>
                            <th>Từ vựng / Cấu trúc</th>
                            <th>Nghĩa & Ghi chú</th>
                        </tr>
                    </thead>
                    <tbody>`;

            let curLvl = ""; let curTyp = ""; let stt = 1;
            listToPrint.forEach(item => {
                if ((item.level || 'None') !== curLvl) {
                    curLvl = item.level || 'None';
                    html += `<tr class="level-header"><td colspan="3">🎯 CẤP ĐỘ: ${curLvl === 'None' ? 'CHƯA PHÂN LOẠI' : curLvl}</td></tr>`;
                    curTyp = "";
                }
                if ((item.type || 'word') !== curTyp) {
                    curTyp = item.type || 'word';
                    let tName = curTyp === 'word' ? 'TỪ ĐƠN' : (curTyp === 'phrase' ? 'CỤM TỪ' : 'COLLOCATIONS');
                    html += `<tr class="type-header"><td colspan="3">-- ${tName} --</td></tr>`;
                    stt = 1;
                }
                html += `
                    <tr style="page-break-inside:avoid;">
                        <td style="text-align:center; font-weight:bold;">${stt++}</td>
                        <td><span class="en-word">${item.en}</span><br><small style="color:#444;">${item.pos || ''} ${item.ipa || ''}</small></td>
                        <td><b>${item.vi}</b>${item.syn ? '<br><small style="color:#555;">Đồng nghĩa: '+item.syn+'</small>' : ''}</td>
                    </tr>`;
            });
            
            html += `</tbody></table>
                    <div style="text-align:center; margin-top:30px; font-weight:bold; font-size:12pt;">--- HẾT ---</div>
                </body>
            </html>`;

            // TẠO CỬA SỔ TÀNG HÌNH (iFrame) VÀ BƠM HTML VÀO ĐÓ
            let printFrame = document.createElement('iframe');
            printFrame.style.position = 'fixed';
            printFrame.style.right = '0';
            printFrame.style.bottom = '0';
            printFrame.style.width = '0';
            printFrame.style.height = '0';
            printFrame.style.border = '0';
            document.body.appendChild(printFrame);

            let doc = printFrame.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();

            // Lấy nét và ra lệnh in nội bộ cửa sổ đó
            printFrame.contentWindow.focus();
            setTimeout(() => { 
                printFrame.contentWindow.print(); 
                // In xong thì tự động dọn rác
                setTimeout(() => { document.body.removeChild(printFrame); }, 1000);
            }, 250); 
        };

        // BẮT ĐẦU VẼ QR RỒI TRUYỀN VÀO HÀM IN
        if (typeof QRCode !== 'undefined' && QRCode.toDataURL) {
            QRCode.toDataURL(shareUrl, { width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' } }, function (err, url) {
                if (err) { alert("Lỗi tạo QR"); return; }
                doPrint(url);
            });
        } else {
            doPrint(`https://quickchart.io/qr?text=${encodeURIComponent(shareUrl)}&size=200`);
        }

    } catch(err) {
        alert("Lỗi in: " + err.message);
    }
}

/* ==========================================================================
   NÂNG CẤP MOBILE UX (STICKY BAR TỰ ĐỘNG)
========================================================================== */
function syncStickyActionBar() {
    const actionBar = document.getElementById('mobile-action-bar');
    if (!actionBar) return;

    // NẾU KHÔNG Ở MÀN HÌNH BÀI LÀM -> ẨN THANH GHIM
    const practiceScreen = document.getElementById('screen-practice');
    if (practiceScreen && practiceScreen.classList.contains('hidden')) {
        actionBar.style.display = 'none';
        actionBar.innerHTML = '';
        return;
    }

    actionBar.innerHTML = '';

    if (isTestMode) {
        const testNavDiv = document.querySelector('#options-container > div:last-child');
        if (testNavDiv && testNavDiv.querySelectorAll('button').length > 0) {
            testNavDiv.querySelectorAll('button').forEach(btn => {
                const newBtn = document.createElement('button');
                newBtn.className = btn.className + ' sticky-btn';
                newBtn.innerHTML = btn.innerHTML;
                newBtn.disabled = btn.disabled;
                newBtn.onclick = () => btn.click();
                actionBar.appendChild(newBtn);
            });
        }
    } else {
        const submitBtn = document.querySelector('#normal-submit-btn:not(.hidden), #cluster-submit-btn:not(.hidden), #reading-submit-btn:not(.hidden), #writing-submit-btn:not(.hidden), #short-submit-btn:not(.hidden)');
        const nextBtn = document.getElementById('next-btn');

        if (submitBtn) {
            const newBtn = document.createElement('button');
            newBtn.className = submitBtn.className + ' sticky-btn';
            newBtn.innerHTML = submitBtn.innerHTML;
            newBtn.onclick = () => submitBtn.click();
            actionBar.appendChild(newBtn);
        } else if (nextBtn && !nextBtn.classList.contains('hidden')) {
            const newBtn = document.createElement('button');
            newBtn.className = nextBtn.className + ' sticky-btn';
            newBtn.innerHTML = nextBtn.innerHTML;
            newBtn.onclick = () => nextBtn.click();
            actionBar.appendChild(newBtn);
        }
    }

    // NẾU THANH TRỐNG RỖNG THÌ ẨN ĐI, CÓ NÚT THÌ HIỆN LÊN LẠI
    if (actionBar.innerHTML.trim() === '') {
        actionBar.style.display = 'none';
    } else {
        actionBar.style.display = ''; 
    }
}

// Bật lính gác theo dõi giao diện
const uiObserver = new MutationObserver(() => syncStickyActionBar());
document.addEventListener('DOMContentLoaded', () => {
    const optsContainer = document.getElementById('options-container');
    const nextBtn = document.getElementById('next-btn');
    if (optsContainer) uiObserver.observe(optsContainer, { childList: true, subtree: true });
    if (nextBtn) uiObserver.observe(nextBtn, { attributes: true, attributeFilter: ['class'] });
});

// THUẬT TOÁN SPACED REPETITION (CHỌN TỪ THEO TRỌNG SỐ)
function getSmartRandomWord(pool) {
    let totalWeight = 0;
    
    // 1. Tính trọng số cho từng từ
    let weights = pool.map(word => {
        let w = 10; // Trọng số cơ bản
        let wrong = word.wrongCount || 0;
        let correct = word.correctCount || 0;
        
        // Công thức: Sai 1 lần cộng 15 điểm. Đúng 1 lần trừ 5 điểm.
        w += (wrong * 15); 
        w -= (correct * 5); 
        
        // Không bao giờ để trọng số nhỏ hơn 1 (vẫn có tỉ lệ xuất hiện cực nhỏ để ôn tập)
        w = Math.max(1, w); 
        
        totalWeight += w;
        return w;
    });

    // 2. Quay xổ số dựa trên tổng trọng số
    let random = Math.random() * totalWeight;
    for (let i = 0; i < pool.length; i++) {
        if (random < weights[i]) return pool[i];
        random -= weights[i];
    }
    
    // Backup an toàn
    return pool[Math.floor(Math.random() * pool.length)]; 
}

/* ==========================================================================
   CHẾ ĐỘ FLASHCARD (ÔN TẬP NHANH) - BẢN TÍCH HỢP BẢO MẬT KHÓA CHỦ ĐỀ
========================================================================== */
let fcWords = [];
let fcCurrentIndex = 0;
let fcTouchStartX = 0;

function openFlashcardMode() {
    const selectedTopic = document.getElementById('vocab-topic-select').value;
    
    // Khởi tạo nếu bộ nhớ lưu pass chưa có
    if (!db.TopicPasswords) db.TopicPasswords = {};
    
    // --- Ổ KHÓA KIỂM TRA AN NHIÊN ---
    if (typeof isTopicUnlocked === 'function') {
        if (!isTopicUnlocked(selectedTopic)) {
            document.getElementById('vocab-topic-select').value = 'ALL'; // Trả dropdown về ALL
            return; 
        }
    } else {
        // Hàm fallback phòng trường hợp chưa định nghĩa hàm kiểm tra rời
        if (selectedTopic !== 'ALL' && db.TopicPasswords[selectedTopic] && db.TopicPasswords[selectedTopic] !== '0') {
            const entered = prompt(`🔒 Bộ Vocab "${selectedTopic}" đã được bảo mật.\nVui lòng nhập mật khẩu để truy cập:`);
            if (entered !== db.TopicPasswords[selectedTopic]) {
                alert("❌ Sai mật khẩu! Bạn không có quyền truy cập bộ Vocab này.");
                document.getElementById('vocab-topic-select').value = 'ALL';
                return;
            }
        }
    }
    
    // --- BỘ LỌC TỪ VỰNG THÔNG MINH ---
    // Nếu chọn ALL: Chỉ hiện các từ thuộc chủ đề công khai (pass bằng 0 hoặc không cài pass)
    // Nếu chọn chủ đề cụ thể: Lấy toàn bộ từ của chủ đề đó (đã vượt qua vòng check pass ở trên)
    if (selectedTopic === 'ALL') {
        fcWords = db.Vocabulary.filter(v => {
            const t = v.topic || 'Chung';
            return !db.TopicPasswords[t] || db.TopicPasswords[t] === '0';
        });
    } else {
        fcWords = db.Vocabulary.filter(v => (v.topic || 'Chung') === selectedTopic);
    }
    
    if (fcWords.length === 0) {
        alert("⚠️ Chủ đề này hiện tại chưa có từ vựng công khai nào!");
        return;
    }
    
    // Đọc trạng thái cấu hình âm thanh TTS của người dùng từ giao diện
    const ttsCheckbox = document.getElementById('start-set-tts');
    vSettings.autoTTS = ttsCheckbox ? ttsCheckbox.checked : false;
   // [MỚI] ÉP TÀNG HÌNH THANH NAV LÚC HỌC FLASHCARD
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) bottomNav.style.setProperty('display', 'none', 'important');

    // Xáo trộn ngẫu nhiên danh sách thẻ để tăng hiệu quả phản xạ học tập
    fcWords.sort(() => Math.random() - 0.5);
    fcCurrentIndex = 0;
    
    renderFlashcardUI();
    document.addEventListener('keydown', handleFlashcardKeys); // Bật trình lắng nghe phím tắt bàn phím
}

function renderFlashcardUI() {
    let overlay = document.getElementById('flashcard-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'flashcard-overlay';
        overlay.className = 'flashcard-overlay';
        document.body.appendChild(overlay);
    }
    overlay.classList.remove('hidden');
    updateFlashcardContent();
}

function updateFlashcardContent() {
    const overlay = document.getElementById('flashcard-overlay');
    const word = fcWords[fcCurrentIndex];
    if (!word) return;
    
    let synHtml = word.syn ? `<p style="font-size:15px; margin-top:20px; color:#a7f3d0; font-weight: 500;"><strong>Đồng nghĩa:</strong> ${word.syn}</p>` : '';
    let antHtml = word.ant ? `<p style="font-size:15px; margin-top:5px; color:#fecdd3; font-weight: 500;"><strong>Trái nghĩa:</strong> ${word.ant}</p>` : '';
    let ipaHtml = word.ipa ? `<span style="font-size:18px; font-family:monospace; background: rgba(0,0,0,0.2); padding: 4px 10px; border-radius: 8px; margin-top:15px; display:inline-block;">${word.ipa}</span>` : '';
    let posHtml = word.pos ? `<span style="font-size:15px; color: var(--text-muted); font-weight:bold; text-transform: uppercase; margin-top:5px; display:block;">${word.pos}</span>` : '';

    // --- LOGIC THU NHỎ FONT THÔNG MINH ---
    // Nếu chữ tiếng Anh dài hơn 12 ký tự -> size 32px, dài hơn 25 ký tự -> size 24px
    let enFontSize = word.en.length > 12 ? (word.en.length > 25 ? '24px' : '32px') : '42px';
    // Nghĩa tiếng Việt dài hơn 15 ký tự -> size 26px, dài hơn 30 ký tự -> size 20px
    let viFontSize = word.vi.length > 15 ? (word.vi.length > 30 ? '20px' : '26px') : '32px';

    overlay.innerHTML = `
        <div class="fc-close" onclick="closeFlashcardMode()"><i class="ph-bold ph-x"></i></div>
        <div style="color:rgba(255,255,255,0.7); font-size:16px; font-weight:bold; letter-spacing: 1px;">
            THẺ ${fcCurrentIndex + 1} / ${fcWords.length}
        </div>
        
        <div class="flashcard-container" id="fc-container">
            <div class="flashcard-inner" id="fc-inner" onclick="flipFlashcard()">
                
                <div class="flashcard-face flashcard-front">
                    <button class="fc-speaker" onclick="playFlashcardTTS(event)">
                        <i class="ph-fill ph-speaker-high"></i>
                    </button>
                    <h2 style="font-size: ${enFontSize}; margin: 0; color: var(--primary); font-weight: 900; line-height: 1.3; overflow-wrap: break-word; padding: 0 10px;">${word.en}</h2>
                    ${posHtml}
                    <div style="position: absolute; bottom: 25px; font-size: 14px; color: var(--text-muted); font-weight: bold;"><i class="ph-bold ph-hand-tap" style="font-size: 20px; vertical-align: middle;"></i> Chạm để lật</div>
                </div>
                
                <div class="flashcard-face flashcard-back">
                    <button class="fc-speaker" onclick="playFlashcardTTS(event)">
                        <i class="ph-fill ph-speaker-high"></i>
                    </button>
                    <h2 style="font-size: ${viFontSize}; margin: 0; color: #fff; font-weight: 800; line-height: 1.3; overflow-wrap: break-word; padding: 0 10px;">${word.vi}</h2>
                    ${ipaHtml}
                    ${synHtml}
                    ${antHtml}
                </div>
            </div>
        </div>
        
        <div class="fc-controls">
            <button class="fc-nav-btn" onclick="prevFlashcard()" ${fcCurrentIndex === 0 ? 'disabled' : ''}><i class="ph-bold ph-caret-left"></i></button>
            <button class="fc-nav-btn" onclick="nextFlashcard()"><i class="ph-bold ph-caret-right"></i></button>
        </div>
        <div style="color:rgba(255,255,255,0.4); font-size:13px; margin-top:20px; font-style: italic;">Phím Space: Lật thẻ | Phím Trái/Phải: Chuyển thẻ</div>
    `;
    
    // Cấu trúc nhận diện cử chỉ vuốt trên màn hình cảm ứng điện thoại
    const fcContainer = document.getElementById('fc-container');
    if (fcContainer) {
        fcContainer.addEventListener('touchstart', e => { fcTouchStartX = e.changedTouches[0].screenX; }, { passive: true });
        fcContainer.addEventListener('touchend', e => {
            let touchEndX = e.changedTouches[0].screenX;
            if (fcTouchStartX - touchEndX > 50) nextFlashcard(); 
            if (touchEndX - fcTouchStartX > 50) prevFlashcard(); 
        }, { passive: true });
    }

    // Tự động phát âm bằng công nghệ Text-to-Speech nếu tùy chọn đang bật
    if (vSettings.autoTTS) playFlashcardTTS(null);
}

function playFlashcardTTS(event) {
    if (event) event.stopPropagation(); 
    const word = fcWords[fcCurrentIndex];
    if (!word) return;
    try {
        window.speechSynthesis.cancel(); 
        const msg = new SpeechSynthesisUtterance(word.en);
        msg.lang = word.lang || 'en-US'; // <-- ĐỔI TỪ GÁN CỨNG 'en-US' THÀNH ĐỘNG THEO TỪNG TỪ CỦA THẺ
        msg.rate = 0.85;
        window.speechSynthesis.speak(msg);
    } catch(e) {}
}

function flipFlashcard() {
    const cardInner = document.getElementById('fc-inner');
    if (cardInner) cardInner.classList.toggle('is-flipped');
}

function nextFlashcard() {
    if (fcCurrentIndex < fcWords.length - 1) {
        fcCurrentIndex++; 
        updateFlashcardContent();
    } else {
        alert("🎉 Tuyệt vời! Em đã hoàn thành việc ôn tập tất cả các thẻ từ vựng trong danh mục này.");
        closeFlashcardMode();
    }
}

function prevFlashcard() {
    if (fcCurrentIndex > 0) {
        fcCurrentIndex--; 
        updateFlashcardContent();
    }
}

function closeFlashcardMode() {
    const overlay = document.getElementById('flashcard-overlay');
    if (overlay) overlay.classList.add('hidden');
    document.removeEventListener('keydown', handleFlashcardKeys); 
    window.speechSynthesis.cancel(); 

    if (isIsolatedMode) {
        const select = document.getElementById('vocab-topic-select');
        const currentTopic = select ? select.value : 'ALL';
        showIsolatedVocabMenu(currentTopic);
    } else {
        // Khôi phục lại thanh điều hướng nếu là user bình thường
        const bottomNav = document.getElementById('bottom-nav');
        if (bottomNav) bottomNav.classList.remove('hide-nav');
    }
}

function handleFlashcardKeys(e) {
    const overlay = document.getElementById('flashcard-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    
    if (e.key === 'ArrowRight') nextFlashcard();
    if (e.key === 'ArrowLeft') prevFlashcard();
    if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault(); // Chặn hành vi cuộn trang mặc định của phím Space
        flipFlashcard();
    }
}

/* ==========================================================================
   TÍNH NĂNG NÂNG CẤP: LỌC & XÓA HÀNG LOẠT THEO CHỦ ĐỀ
========================================================================== */

function updateManageTopicDropdown() {
    const filterSelect = document.getElementById('manage-vocab-filter');
    if (!filterSelect) return;

    const currentSelected = filterSelect.value || 'ALL';
    const topics = [...new Set(db.Vocabulary.map(v => v.topic || 'Chung'))];

    let html = '<option value="ALL">✨ Tất cả chủ đề</option>';
    topics.forEach(t => {
        html += `<option value="${t}">📁 ${t}</option>`;
    });
    filterSelect.innerHTML = html;

    if (topics.includes(currentSelected) || currentSelected === 'ALL') {
        filterSelect.value = currentSelected;
    } else {
        filterSelect.value = 'ALL';
    }
}

function filterVocabTable() {
    const filterSelect = document.getElementById('manage-vocab-filter');
    if (!filterSelect) return;
    
    const targetTopic = filterSelect.value;
    
    // --- 1. KIỂM TRA Ổ KHÓA KHI CHỌN CHỦ ĐỀ CỤ THỂ ---
    if (targetTopic !== 'ALL' && typeof isTopicUnlocked === 'function') {
        if (!isTopicUnlocked(targetTopic)) {
            // Nếu người dùng nhập sai mật khẩu, ép Dropdown quay về "Tất cả chủ đề" và lọc lại
            filterSelect.value = 'ALL'; 
            filterVocabTable(); 
            return;
        }
    }

    // --- 2. THỰC HIỆN LỌC VÀ ẨN/HIỆN GIAO DIỆN ---
    const rows = document.querySelectorAll('#vocab-manage-list .vocab-item-row');
    
    // Đảm bảo db.TopicPasswords tồn tại để không bị lỗi undefined
    if (!db.TopicPasswords) db.TopicPasswords = {};

    rows.forEach(row => {
        const rowTopic = row.getAttribute('data-topic') || 'Chung';
        
        if (targetTopic === 'ALL') {
            // Chế độ "Tất cả chủ đề": Kiểm tra xem chủ đề của từ này có bị khóa pass không?
            let isLocked = db.TopicPasswords[rowTopic] && db.TopicPasswords[rowTopic] !== '0';
            
            // Nếu bị khóa thì TÀNG HÌNH luôn, nếu không khóa thì hiện bình thường
            row.style.display = isLocked ? 'none' : '';
        } else {
            // Chế độ "Chọn 1 chủ đề cụ thể": Chỉ hiện đúng các từ của chủ đề đang chọn
            row.style.display = (rowTopic === targetTopic) ? '' : 'none'; 
        }
    });
}

function deleteTopicBulk() {
    const filterSelect = document.getElementById('manage-vocab-filter');
    if (!filterSelect) return;

    const selectedTopic = filterSelect.value;
    if (selectedTopic === 'ALL') {
        alert("⚠️ Không thể dùng tính năng này ở mục 'Tất cả chủ đề'. Vui lòng chọn một chủ đề cụ thể để xóa!");
        return;
    }

    const countToDelete = db.Vocabulary.filter(v => (v.topic || 'Chung') === selectedTopic).length;
    if (countToDelete === 0) return;

    const confirmFirst = confirm(`❗ CẢNH BÁO: Bạn có chắc chắn muốn XÓA SẠCH toàn bộ ${countToDelete} từ vựng thuộc chủ đề "${selectedTopic}" không?`);
    if (!confirmFirst) return;

    // Lọc bỏ các từ thuộc chủ đề bị xóa
    db.Vocabulary = db.Vocabulary.filter(v => (v.topic || 'Chung') !== selectedTopic);
    localStorage.setItem('myStudyData', JSON.stringify(db));

    alert(`🎉 Đã xóa sạch chủ đề "${selectedTopic}" (${countToDelete} từ vựng)!`);
    renderVocabList(); 
}

/* ==========================================================================
   HỆ THỐNG BẢO MẬT BỘ VOCAB THEO NGƯỜI DÙNG (CÀI PASS)
========================================================================== */

// Khởi tạo kho lưu mật khẩu nếu chưa có
if (!db.TopicPasswords) db.TopicPasswords = {};

// Hàm kiểm tra an ninh (Trả về true nếu được phép vào, false nếu sai pass)
function isTopicUnlocked(topicName) {
    if (!db.TopicPasswords) db.TopicPasswords = {};
    if (topicName === 'ALL') return true; 
    
    const pass = db.TopicPasswords[topicName];
    // Nếu không có pass hoặc pass là 0 -> Công khai
    if (!pass || pass === '0') return true; 

    // Nếu có pass -> Yêu cầu nhập
    const entered = prompt(`🔒 Bộ Vocab "${topicName}" đã được bảo mật.\nVui lòng nhập mật khẩu để truy cập:`);
    if (entered === pass) {
        return true;
    } else {
        alert("❌ Sai mật khẩu! Bạn không có quyền truy cập bộ Vocab này.");
        return false;
    }
}

/* ==========================================================================
   TÍNH NĂNG MACRO BUILDER: LẮP RÁP CÂU HỎI THỦ CÔNG
========================================================================== */

function switchComposeMode(mode) {
    if(mode === 'raw') {
        document.getElementById('tab-raw').className = 'btn btn-primary btn-sm';
        document.getElementById('tab-raw').style.boxShadow = '';
        document.getElementById('tab-builder').className = 'btn btn-secondary btn-sm';
        document.getElementById('tab-builder').style.border = 'none';
        
        document.getElementById('raw-text').classList.remove('hidden');
        document.getElementById('builder-mode').classList.add('hidden');
    } else {
        document.getElementById('tab-builder').className = 'btn btn-primary btn-sm';
        document.getElementById('tab-builder').style.boxShadow = '';
        document.getElementById('tab-raw').className = 'btn btn-secondary btn-sm';
        document.getElementById('tab-raw').style.border = 'none';
        
        document.getElementById('builder-mode').classList.remove('hidden');
        document.getElementById('raw-text').classList.add('hidden');
        
        // Khởi tạo Form khi vừa chuyển tab
        if(document.getElementById('builder-options-area').innerHTML.trim() === '') {
            changeBuilderType(); 
        }
    }
}

function changeBuilderType() {
    const type = document.getElementById('builder-type').value;
    const area = document.getElementById('builder-options-area');
    area.innerHTML = '';
    
    if (type === 'abcd') {
        const labels = ['A', 'B', 'C', 'D'];
        labels.forEach((l, i) => {
            area.innerHTML += `
            <div class="builder-row">
                <input type="radio" name="b_abcd_correct" value="${i}" ${i===0?'checked':''} style="width:20px; height:20px; cursor:pointer; accent-color: var(--primary);">
                <span style="font-weight:900; font-size:16px; width:25px; color: var(--primary);">${l}.</span>
                <input type="text" id="b_abcd_opt_${i}" class="builder-input" placeholder="Phương án ${l}..." style="border:none; background:transparent; padding:12px 0;">
            </div>`;
        });
    } 
    else if (type === 'tf') {
        const labels = ['a', 'b', 'c', 'd'];
        labels.forEach((l, i) => {
            area.innerHTML += `
            <div class="builder-row">
                <select id="b_tf_correct_${i}" style="padding:10px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main); font-weight:bold; cursor:pointer;">
                    <option value="true">ĐÚNG</option>
                    <option value="false">SAI</option>
                </select>
                <span style="font-weight:900; font-size:16px; width:25px; margin-left: 10px; color: var(--primary);">${l})</span>
                <input type="text" id="b_tf_opt_${i}" class="builder-input" placeholder="Nội dung mệnh đề ${l}..." style="border:none; background:transparent; padding:12px 0;">
            </div>`;
        });
    } 
    else if (type === 'short') {
        area.innerHTML = `
            <div style="background:var(--card-bg-elevated); padding:15px; border-radius:12px; border:1px solid var(--border-color);">
                <label style="font-size:13px; font-weight:bold; color:var(--text-muted); display:block; margin-bottom:8px;">Nhập đáp án chính xác nhất (Học sinh phải điền khớp):</label>
                <input type="text" id="b_short_ans" class="builder-input" placeholder="VD: Năm 1945..." style="padding:14px; background:var(--bg-main);">
            </div>
        `;
    }
}

function insertBuiltQuestion() {
    const type = document.getElementById('builder-type').value;
    const qText = document.getElementById('builder-q').value.trim();
    const expText = document.getElementById('builder-exp').value.trim();
    
    if (!qText) { alert('⚠️ Vui lòng nhập nội dung câu hỏi trước khi chèn!'); return; }
    
    // Thuật toán: Tự động đếm xem đã có bao nhiêu chữ "Câu x:" để chèn số tiếp theo
    const rawTextArea = document.getElementById('raw-text');
    const currentRaw = rawTextArea.value;
    const qMatches = currentRaw.match(/(?:Câu|Question|Bài)\s*\d+/gi);
    let nextQNum = (qMatches ? qMatches.length : 0) + 1;
    
    let output = `Câu ${nextQNum}: ${qText}\n`;
    
    // Sinh đáp án theo cấu trúc
    if (type === 'abcd') {
        const labels = ['A', 'B', 'C', 'D'];
        const correctIndex = document.querySelector('input[name="b_abcd_correct"]:checked').value;
        for(let i=0; i<4; i++) {
            let optVal = document.getElementById(`b_abcd_opt_${i}`).value.trim() || `Phương án ${labels[i]}`;
            if (i.toString() === correctIndex.toString()) { output += `*${labels[i]}. ${optVal}\n`; } 
            else { output += `${labels[i]}. ${optVal}\n`; }
        }
    } 
    else if (type === 'tf') {
        const labels = ['a', 'b', 'c', 'd'];
        for(let i=0; i<4; i++) {
            let isTrue = document.getElementById(`b_tf_correct_${i}`).value === 'true';
            let optVal = document.getElementById(`b_tf_opt_${i}`).value.trim() || `Mệnh đề ${labels[i]}`;
            if (isTrue) { output += `*${labels[i]}) ${optVal}\n`; } 
            else { output += `${labels[i]}) ${optVal}\n`; }
        }
    } 
    else if (type === 'short') {
        let shortAns = document.getElementById('b_short_ans').value.trim() || 'Đáp án chưa xác định';
        output += `Đáp án: ${shortAns}\n`;
    }
    
    // Gắn thêm giải thích
    if (expText) { output += `Giải thích: ${expText}\n`; }
    output += `\n`;
    
    // Bắn dữ liệu vào ô Raw Text (Xuống dòng cho đẹp)
    if (currentRaw && !currentRaw.endsWith('\n\n')) { rawTextArea.value += '\n\n' + output; } 
    else { rawTextArea.value += output; }
    
    // Dọn dẹp ô nhập liệu để nhập câu tiếp theo
    document.getElementById('builder-q').value = '';
    document.getElementById('builder-exp').value = '';
    changeBuilderType(); 
    
    // Chuyển về màn hình Soạn Nhanh để xem kết quả và cuộn xuống dưới cùng
    switchComposeMode('raw');
    rawTextArea.scrollTop = rawTextArea.scrollHeight;
}

// =========================================================================
// HỆ THỐNG BOOKMARK CÁ NHÂN (MỚI THÊM)
// =========================================================================

// 1. Tải danh sách câu hỏi khó từ Google Sheets về máy khi đăng nhập thành công
async function fetchUserBookmarks(username) {
    try {
        // NHỚ ĐỔI "CLOUD_API_URL" thành đường dẫn Web App của em
        let response = await fetch("CLOUD_API_URL", { 
            method: 'POST',
            body: JSON.stringify({ action: 'get_bookmarks', username: username })
        });
        let bookmarkedQuestions = await response.json();
        
        if (!db.Bookmarks) db.Bookmarks = [];
        db.Bookmarks = bookmarkedQuestions;
        localStorage.setItem('myStudyData', JSON.stringify(db)); 
        console.log("Đã tải xong kho câu hỏi khó cá nhân!");
    } catch (e) {
        console.log("Lỗi tải dữ liệu bookmark: ", e);
        db.Bookmarks = [];
    }
}

// 2. Thêm hoặc xóa câu hỏi khỏi danh sách câu khó khi bấm nút ⭐️
function toggleBookmark(questionObj) {
    // Lấy tên tài khoản đang đăng nhập từ hệ thống của em
    var currentUser = localStorage.getItem('currentLoggedInUser') || (window.currentUser ? window.currentUser.username : ""); 
    
    if (!currentUser) {
        alert("Bạn cần đăng nhập để lưu câu hỏi khó!");
        return;
    }

    if (!db.Bookmarks) db.Bookmarks = [];

    // Kiểm tra xem câu hỏi này đã tồn tại trong danh sách chưa (so sánh nội dung chữ)
    var existsIndex = db.Bookmarks.findIndex(function(q) {
        return q.content === questionObj.content;
    });

    if (existsIndex === -1) {
        // Nếu chưa có -> Thêm vào mảng
        db.Bookmarks.push(questionObj);
        alert("Đã lưu vào danh sách câu hỏi khó! ⭐️");
    } else {
        // Nếu đã có -> Xóa khỏi mảng (bỏ đánh dấu)
        db.Bookmarks.splice(existsIndex, 1);
        alert("Đã bỏ lưu câu hỏi này!");
    }

    // Lưu ngay lập tức vào localStorage để giao diện mượt mà không bị delay
    localStorage.setItem('myStudyData', JSON.stringify(db));

    // Đồng bộ ngầm dữ liệu lên Google Sheets (Học sinh không phải chờ)
    fetch("CLOUD_API_URL", { 
        method: 'POST',
        body: JSON.stringify({ 
            action: 'update_bookmarks', 
            username: currentUser, 
            bookmarks: db.Bookmarks 
        })
    }).catch(function(err) {
        console.log("Lỗi đồng bộ ngầm Bookmark lên bộ nhớ đám mây: ", err);
    });
}

// Hàm chuyển sang màn hình xem câu hỏi khó
function openBookmarkScreen() {
    // Ẩn tất cả các màn hình khác
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.add('hidden'); });
    // Hiển thị màn hình bookmark
    document.getElementById('screen-bookmarks').classList.remove('hidden');
    document.getElementById('app-title').innerText = "Kho Câu Hỏi Khó";
    
    // Chạy hàm nạp dữ liệu câu hỏi ra giao diện
    renderBookmarksList();
}

// Hàm render danh sách câu hỏi đã lưu thành các thẻ bento đẹp mắt
// Hàm render danh sách câu hỏi đã lưu thành các thẻ bento đẹp mắt
function renderBookmarksList() {
    var container = document.getElementById('bookmarks-list');
    container.innerHTML = '';
    
    // Nếu chưa có câu nào được lưu
    if (!db.Bookmarks || db.Bookmarks.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 50px 20px; background: var(--card-bg-elevated); border-radius: 16px; border: 1px dashed var(--border-color);">
                <div style="font-size: 40px; margin-bottom: 10px;">🍃</div>
                <p style="margin: 0; font-weight: 600;">Em chưa lưu câu hỏi khó nào cả!</p>
                <p style="font-size: 13px; margin-top: 5px;">Hãy bấm biểu tượng ⭐️ khi làm bài tập để lưu các câu hỏi cần ôn lại nhé.</p>
            </div>`;
        return;
    }
    
    // Duyệt qua từng câu hỏi trong kho lưu trữ
    db.Bookmarks.forEach(function(q, index) {
        var card = document.createElement('div');
        card.className = 'quiz-item'; 
        card.style.flexDirection = 'column';
        card.style.alignItems = 'flex-start';
        card.style.gap = '12px';
        
        var contentText = q.content || q.text || "Câu hỏi không có nội dung";
        var answerText = "";

        // 1. XỬ LÝ ĐẶC BIỆT CHO CÂU ĐÚNG/SAI
        if (q.type === "cluster-tf" && q.statements) {
            var labelsTF = ['a', 'b', 'c', 'd', 'e', 'f'];
            
            // Nối thêm các mệnh đề a, b, c, d vào bên dưới câu hỏi để dễ đọc
            var stmtsHtml = q.statements.map(function(stmt, i) {
                return "<br><b>" + labelsTF[i] + ")</b> " + cleanOpt(stmt.text);
            }).join("");
            contentText += stmtsHtml;
            
            // Lấy đáp án Đúng/Sai của từng mệnh đề
            var tfAnswers = q.statements.map(function(stmt, i) {
                return "<b>" + labelsTF[i] + ")</b> " + (stmt.isTrue ? "Đúng" : "Sai");
            });
            answerText = tfAnswers.join(" &nbsp;&nbsp;|&nbsp;&nbsp; ");
        } 
        
        // 2. XỬ LÝ ĐẶC BIỆT CHO CÂU CHÙM ĐỌC HIỂU
        else if (q.type === "reading-cluster" && q.questions) {
            if (q.context) contentText = q.context + "<br><br>" + contentText;
            
            // Hiện danh sách các câu hỏi con
            var subQsHtml = q.questions.map(function(subQ, i) {
                return "<br><b>Câu " + (i+1) + ":</b> " + cleanOpt(subQ.content);
            }).join("");
            contentText += subQsHtml;

            // Hiện danh sách đáp án của các câu hỏi con
            var readingAnswers = q.questions.map(function(subQ, i) {
                return "<b>Câu " + (i+1) + ":</b> " + cleanOpt(subQ.correctAnswer || "Tự luận");
            });
            answerText = readingAnswers.join(" <br> ");
        } 
        
        // 3. CÁC CÂU TRẮC NGHIỆM ABCD / TRẢ LỜI NGẮN BÌNH THƯỜNG
        else {
            answerText = cleanOpt(q.correctAnswer || "Tự luận / Trả lời ngắn");
        }
        
        card.innerHTML = `
            <div style="width: 100%; display: flex; justify-content: space-between; align-items: flex-start; gap: 15px;">
                <div style="font-size: 16px; font-weight: 700; color: var(--text-main); text-align: justify; word-break: break-word;">
                    <span style="color: #f59e0b; margin-right: 5px;">#${index + 1}</span> ${formatText(contentText)}
                </div>
                <button onclick="removeBookmarkDirect(${index})" class="btn" style="padding: 6px 12px; background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2); font-size: 12px; box-shadow: none; flex-shrink: 0;" title="Xóa khỏi danh sách">❌ Xóa</button>
            </div>
            <div style="font-size: 15px; line-height: 1.6; color: var(--text-main); background: var(--bg-main); padding: 12px 15px; border-radius: 8px; width: 100%; box-sizing: border-box; border: 1px solid var(--border-color); margin-top: 5px;">
                🔑 <strong style="color: var(--success);">Đáp án đúng:</strong> <br>${formatText(answerText)}
            </div>
        `;
        container.appendChild(card);
    });

    // Kích hoạt MathJax để vẽ công thức Toán học nếu có
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise([container]).catch(function(err) { console.log(err); });
    }
}

// Hàm hỗ trợ xóa nhanh câu hỏi ra khỏi danh sách ngay tại giao diện xem lại
function removeBookmarkDirect(index) {
    if (!confirm("Em muốn xóa câu hỏi này khỏi danh sách câu hỏi khó?")) return;
    
    db.Bookmarks.splice(index, 1);
    localStorage.setItem('myStudyData', JSON.stringify(db));
    
    // Tải lại giao diện sau khi xóa
    renderBookmarksList();
    
    // Đồng bộ lệnh xóa ngầm lên Google Sheets
    var currentUser = localStorage.getItem('currentLoggedInUser') || "";
    if (currentUser) {
        fetch(CLOUD_API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'update_bookmarks', username: currentUser, bookmarks: db.Bookmarks })
        }).catch(function(err) { console.log("Lỗi đồng bộ xóa: ", err); });
    }
}
