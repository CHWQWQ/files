// 自動轉換URL為超連結（只抓英數與網址符號，遇到中文或空白就停止，並去掉結尾標點）
function convertUrlsToLinks(text) {
    const urlChars = "[A-Za-z0-9\\-._~:\\/?#\\[\\]@!$&'()*+,;=%]+";
    const urlRegex = new RegExp(`(https?:\\/\\/${urlChars}|www\\.${urlChars})`, 'gi');

    return text.replace(urlRegex, function(match) {
        const trailing = (match.match(/[.,;:!?)\]'*]+$/) || [''])[0];
        const url = trailing ? match.slice(0, -trailing.length) : match;
        // 如果是 www 開頭，自動加上 https://
        const href = url.startsWith('www.') ? 'https://' + url : url;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">${url}</a>${trailing}`;
    });
}

// 組別對應表
const departments = {
    'shsd': '住宿服務組',
    'isrc': '原民中心',
    'dsa': '學務長室',
    'saad': '就學服務組',
    'clss': '生輔教中心',
    'hd': '衛生保健組',
    'esd': '課外活動組',
    'scd': '諮商輔導組',
    'hesp': '高教深耕'
};

// 全域變數
let faqData = [];
let expandedCategories = {};
let expandedQuestions = {};
let editingCategory = null;
let editingQuestion = null;
let showPreview = false;
let currentDepartment = 'shsd'; // 預設為住宿服務組

// ===== 資料檢查與自動暫存 =====
const STORAGE_KEY = 'faqEditor_v1';

// HTML 跳脫（用於顯示使用者輸入的子類別）
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 檢查 FAQ 資料格式，正確回傳 null，錯誤回傳說明文字
function validateFaqData(data) {
    if (!Array.isArray(data)) return '最外層必須是陣列（[ ]）';
    const seenIds = new Set();
    for (let i = 0; i < data.length; i++) {
        const cat = data[i];
        const catLabel = `第 ${i + 1} 個類別`;
        if (!cat || typeof cat !== 'object' || Array.isArray(cat)) return `${catLabel}必須是物件`;
        if (typeof cat.id !== 'string' || !cat.id) return `${catLabel}缺少 id`;
        if (typeof cat.categoryName !== 'string') return `${catLabel}缺少 categoryName`;
        if (!Array.isArray(cat.questions)) return `${catLabel}的 questions 必須是陣列`;
        if (seenIds.has(cat.id)) return `${catLabel}的 id 重複：${cat.id}`;
        seenIds.add(cat.id);
        for (let j = 0; j < cat.questions.length; j++) {
            const q = cat.questions[j];
            const qLabel = `${catLabel}的第 ${j + 1} 個問題`;
            if (!q || typeof q !== 'object' || Array.isArray(q)) return `${qLabel}必須是物件`;
            if (typeof q.id !== 'string' || !q.id) return `${qLabel}缺少 id`;
            if (typeof q.question !== 'string') return `${qLabel}缺少 question`;
            if (typeof q.answer !== 'string') return `${qLabel}缺少 answer`;
            if (q.subCategory !== undefined && typeof q.subCategory !== 'string') return `${qLabel}的 subCategory 必須是文字`;
            if (seenIds.has(q.id)) return `${qLabel}的 id 重複：${q.id}`;
            seenIds.add(q.id);
        }
    }
    return null;
}

// 存到瀏覽器（localStorage），重新整理後可還原
function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ department: currentDepartment, data: faqData }));
    } catch (e) {
        console.warn('自動暫存失敗：', e);
    }
}

// 讀取暫存，成功還原回傳 true
function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const saved = JSON.parse(raw);
        if (!saved || validateFaqData(saved.data) !== null) return false;
        faqData = saved.data;
        if (departments[saved.department]) currentDepartment = saved.department;
        return true;
    } catch (e) {
        return false;
    }
}

// 拖拽相關變數
let draggedElement = null;
let draggedIndex = -1;
let draggedType = null; // 'category' 或 'question'
let draggedCategoryId = null;

// DOM 元素
let editMode, previewMode, toggleModeBtn, addCategoryBtn, exportBtn, importBtn;
let importInput, emptyState, categoriesContainer, previewContainer, departmentSelect;

// 初始化DOM元素
function initializeElements() {
    editMode = document.getElementById('editMode');
    previewMode = document.getElementById('previewMode');
    toggleModeBtn = document.getElementById('toggleModeBtn');
    addCategoryBtn = document.getElementById('addCategoryBtn');
    exportBtn = document.getElementById('exportBtn');
    importBtn = document.getElementById('importBtn');
    importInput = document.getElementById('importInput');
    emptyState = document.getElementById('emptyState');
    categoriesContainer = document.getElementById('categoriesContainer');
    previewContainer = document.getElementById('previewContainer');
    departmentSelect = document.getElementById('departmentSelect');
}

// 輔助函數：從ID提取類別編號
function extractCategoryNumber(id) {
    const match = id.match(/([a-z]+)_c(\d+)_/);
    return match ? parseInt(match[2]) : 0;
}

// 輔助函數：從ID提取問題編號
function extractQuestionNumber(id) {
    const match = id.match(/([a-z]+)_c(\d+)_(\d+)/);
    // match[2] 是類別編號，從 match[3]中切掉類別編號的長度，剩下的就是問題編號
    return match ? parseInt(match[3].slice(match[2].length)) : 0;
}

// 輔助函數：從ID提取部門代碼
function extractDepartmentCode(id) {
    const match = id.match(/^([a-z]+)_/);
    return match ? match[1] : currentDepartment;
}

// 生成新的類別ID
function generateCategoryId() {
    const existingIds = faqData.map(cat => cat.id);
    const departmentIds = existingIds.filter(id => id.startsWith(currentDepartment));
    const maxClassNumber = Math.max(...departmentIds.map(id => extractCategoryNumber(id)), 0);
    const newClassNumber = maxClassNumber + 1;
    return `${currentDepartment}_c${newClassNumber}_${newClassNumber}`;
}

// 生成新的問題ID
function generateQuestionId(categoryId) {
    const departmentCode = extractDepartmentCode(categoryId);
    const classNumber = extractCategoryNumber(categoryId);
    const category = faqData.find(cat => cat.id === categoryId);
    const maxQuestionNumber = Math.max(...category.questions.map(q => extractQuestionNumber(q.id)), 0);
    const newQuestionNumber = maxQuestionNumber + 1;
    return `${departmentCode}_c${classNumber}_${classNumber}${newQuestionNumber}`;
}

// 拖拽功能實現
function enableDragAndDrop() {
    // 類別拖拽
    function handleCategoryDragStart(e, categoryIndex) {
        draggedElement = e.currentTarget;
        draggedIndex = categoryIndex;
        draggedType = 'category';
        draggedCategoryId = null;
        
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.currentTarget.outerHTML);
    }
    
    function handleCategoryDragEnd(e) {
        e.currentTarget.classList.remove('dragging');
        clearDragStyles();
    }
    
    function handleCategoryDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        const categoryCard = e.currentTarget;
        const rect = categoryCard.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        
        if (e.clientY < midY) {
            showSortIndicator(categoryCard, 'top');
        } else {
            showSortIndicator(categoryCard, 'bottom');
        }
    }
    
    function handleCategoryDrop(e, targetIndex) {
        e.preventDefault();
        
        if (draggedType === 'category' && draggedIndex !== targetIndex) {
            const draggedCategory = faqData[draggedIndex];
            faqData.splice(draggedIndex, 1);
            
            const newIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
            faqData.splice(newIndex, 0, draggedCategory);
            
            renderEditMode();
            showNotification('類別順序已更新', 'success');
        }
        
        clearDragStyles();
    }
    
    // 問題拖拽
    function handleQuestionDragStart(e, categoryId, questionIndex) {
        draggedElement = e.currentTarget;
        draggedIndex = questionIndex;
        draggedType = 'question';
        draggedCategoryId = categoryId;
        
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.currentTarget.outerHTML);
    }
    
    function handleQuestionDragEnd(e) {
        e.currentTarget.classList.remove('dragging');
        clearDragStyles();
    }
    
    function handleQuestionDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        const questionItem = e.currentTarget;
        const rect = questionItem.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        
        if (e.clientY < midY) {
            showSortIndicator(questionItem, 'top');
        } else {
            showSortIndicator(questionItem, 'bottom');
        }
    }
    
    function handleQuestionDrop(e, targetCategoryId, targetQuestionIndex) {
        e.preventDefault();
        
        if (draggedType === 'question') {
            const sourceCategoryIndex = faqData.findIndex(cat => cat.id === draggedCategoryId);
            const targetCategoryIndex = faqData.findIndex(cat => cat.id === targetCategoryId);
            
            if (sourceCategoryIndex !== -1 && targetCategoryIndex !== -1) {
                const draggedQuestion = faqData[sourceCategoryIndex].questions[draggedIndex];
                
                // 從原位置移除
                faqData[sourceCategoryIndex].questions.splice(draggedIndex, 1);
                
                // 計算新位置
                let newIndex = targetQuestionIndex;
                if (draggedCategoryId === targetCategoryId && draggedIndex < targetQuestionIndex) {
                    newIndex = targetQuestionIndex - 1;
                }
                
                // 插入到新位置
                faqData[targetCategoryIndex].questions.splice(newIndex, 0, draggedQuestion);
                
                renderEditMode();
                showNotification('問題順序已更新', 'success');
            }
        }
        
        clearDragStyles();
    }
    
    // 輔助函數
    function showSortIndicator(element, position) {
        clearDragStyles();
        const indicator = document.createElement('div');
        indicator.className = `sort-indicator show ${position}`;
        element.style.position = 'relative';
        element.appendChild(indicator);
    }
    
    function clearDragStyles() {
        document.querySelectorAll('.sort-indicator').forEach(el => el.remove());
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }
    
    // 暴露拖拽函數到全域
    window.handleCategoryDragStart = handleCategoryDragStart;
    window.handleCategoryDragEnd = handleCategoryDragEnd;
    window.handleCategoryDragOver = handleCategoryDragOver;
    window.handleCategoryDrop = handleCategoryDrop;
    window.handleQuestionDragStart = handleQuestionDragStart;
    window.handleQuestionDragEnd = handleQuestionDragEnd;
    window.handleQuestionDragOver = handleQuestionDragOver;
    window.handleQuestionDrop = handleQuestionDrop;
}

// 更新部門資訊顯示
function updateDepartmentInfo() {
    const departmentInfo = document.getElementById('departmentInfo');
    const currentDeptDisplay = document.getElementById('currentDeptDisplay');
    const idFormatExample = document.getElementById('idFormatExample');
    const departmentName = departments[currentDepartment];
    
    if (departmentInfo) {
        departmentInfo.innerHTML = `
            <div class="flex items-center space-x-2 text-sm text-gray-600">
                <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded font-mono">${currentDepartment}</span>
                <span>${departmentName}</span>
            </div>
        `;
    }
    
    if (currentDeptDisplay) {
        currentDeptDisplay.innerHTML = `
            <span class="font-mono text-blue-700">${currentDepartment}</span>
            <span class="text-blue-600">${departmentName}</span>
        `;
    }
    
    if (idFormatExample) {
        idFormatExample.textContent = `${currentDepartment}_c1_1`;
    }
}

// 新增類別
function addCategory() {
    const newId = generateCategoryId();
    const newCategory = {
        id: newId,
        categoryName: "",
        questions: []
    };
    faqData.push(newCategory);
    expandedCategories[newId] = true;
    editingCategory = newId;
    renderEditMode();
}

// 新增問題
function addQuestion(categoryId) {
    const newId = generateQuestionId(categoryId);
    const newQuestion = {
        id: newId,
        question: "",
        answer: ""
    };
    
    const categoryIndex = faqData.findIndex(cat => cat.id === categoryId);
    faqData[categoryIndex].questions.push(newQuestion);
    expandedQuestions[newId] = true;
    editingQuestion = newId;
    renderEditMode();
}

// 刪除類別
function deleteCategory(categoryId) {
    if (confirm('確定要刪除此類別及其所有問題嗎？')) {
        faqData = faqData.filter(cat => cat.id !== categoryId);
        editingCategory = null;
        renderEditMode();
        renderPreview();
    }
}

// 刪除問題
function deleteQuestion(categoryId, questionId) {
    if (confirm('確定要刪除此問題嗎？')) {
        const categoryIndex = faqData.findIndex(cat => cat.id === categoryId);
        faqData[categoryIndex].questions = faqData[categoryIndex].questions.filter(q => q.id !== questionId);
        editingQuestion = null;
        renderEditMode();
        renderPreview();
    }
}

// 儲存類別編輯
function saveCategoryEdit(categoryId, newName) {
    const categoryIndex = faqData.findIndex(cat => cat.id === categoryId);
    faqData[categoryIndex].categoryName = newName;
    editingCategory = null;
    renderEditMode();
    renderPreview();
}

// 儲存問題編輯
function saveQuestionEdit(categoryId, questionId, newQuestion, newAnswer, newSubCategory = '') {
    const categoryIndex = faqData.findIndex(cat => cat.id === categoryId);
    const questionIndex = faqData[categoryIndex].questions.findIndex(q => q.id === questionId);
    
    // 自動轉換答案中的URL為超連結
    const processedAnswer = convertUrlsToLinks(newAnswer);
    
    faqData[categoryIndex].questions[questionIndex].question = newQuestion;
    faqData[categoryIndex].questions[questionIndex].answer = processedAnswer;
    // 子類別為選填：有填才寫入，清空就移除欄位
    const subName = (newSubCategory || '').trim();
    if (subName) {
        faqData[categoryIndex].questions[questionIndex].subCategory = subName;
    } else {
        delete faqData[categoryIndex].questions[questionIndex].subCategory;
    }
    editingQuestion = null;
    renderEditMode();
    renderPreview();
}

// 切換類別展開狀態
function toggleCategory(categoryId) {
    expandedCategories[categoryId] = !expandedCategories[categoryId];
    if (showPreview) {
        renderPreview();
    } else {
        renderEditMode();
    }
}

// 切換問題展開狀態
function toggleQuestion(questionId) {
    expandedQuestions[questionId] = !expandedQuestions[questionId];
    if (showPreview) {
        renderPreview();
    } else {
        renderEditMode();
    }
}

// 渲染編輯模式
function renderEditMode() {
    saveToStorage(); // 每次畫面更新就自動暫存
    if (faqData.length === 0) {
        emptyState.style.display = 'block';
        categoriesContainer.innerHTML = '';
        return;
    }

    emptyState.style.display = 'none';
    categoriesContainer.innerHTML = faqData.map((category, categoryIndex) => `
        <div class="card-modern p-6 sortable-item draggable" 
             draggable="true"
             ondragstart="handleCategoryDragStart(event, ${categoryIndex})"
             ondragend="handleCategoryDragEnd(event)"
             ondragover="handleCategoryDragOver(event)"
             ondrop="handleCategoryDrop(event, ${categoryIndex})">
            <div class="category-header p-6 mb-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <!-- 拖拽手柄 -->
                        <div class="drag-handle p-1" title="拖拽移動類別">
                            <svg class="icon" viewBox="0 0 24 24">
                                <line x1="3" y1="6" x2="21" y2="6"/>
                                <line x1="3" y1="12" x2="21" y2="12"/>
                                <line x1="3" y1="18" x2="21" y2="18"/>
                            </svg>
                        </div>
                        <button onclick="toggleCategory('${category.id}')" class="btn-modern p-3">
                            <svg class="icon transition-transform" viewBox="0 0 24 24">
                                ${expandedCategories[category.id] ? 
                                    '<polyline points="6,9 12,15 18,9"></polyline>' : 
                                    '<polyline points="9,18 15,12 9,6"></polyline>'
                                }
                            </svg>
                        </button>
                        ${editingCategory === category.id ? 
                            `<input type="text" value="${category.categoryName}" 
                                   class="input-modern text-xl font-bold flex-1"
                                   placeholder="輸入類別名稱"
                                   id="edit-cat-${category.id}">` :
                            `<h3 class="text-xl font-bold text-gray-800">${category.categoryName || '未命名類別'}</h3>`
                        }
                        <span class="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-lg font-medium">
                            ${category.id}
                        </span>
                        <span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                            ${category.questions.length} 個問題
                        </span>
                    </div>
                    <div class="flex items-center space-x-2">
                        ${editingCategory === category.id ? `
                            <button onclick="saveCategoryFromInput('${category.id}')" class="btn-modern btn-success p-3" title="儲存">
                                <svg class="icon" viewBox="0 0 24 24">
                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                    <polyline points="17,21 17,13 7,13 7,21"/>
                                    <polyline points="7,3 7,8 15,8"/>
                                </svg>
                            </button>
                            <button onclick="cancelEdit()" class="btn-modern p-3 hover:bg-gray-50" title="取消">
                                <svg class="icon" viewBox="0 0 24 24">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        ` : `
                            <button onclick="editCategory('${category.id}')" class="btn-modern p-3 hover:bg-blue-50 text-blue-600" title="編輯類別">
                                <svg class="icon" viewBox="0 0 24 24">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button onclick="addQuestion('${category.id}')" class="btn-modern btn-success p-3" title="新增問題">
                                <svg class="icon" viewBox="0 0 24 24">
                                    <line x1="12" y1="5" x2="12" y2="19"/>
                                    <line x1="5" y1="12" x2="19" y2="12"/>
                                </svg>
                            </button>
                            <button onclick="deleteCategory('${category.id}')" class="btn-modern btn-danger p-3" title="刪除類別">
                                <svg class="icon" viewBox="0 0 24 24">
                                    <polyline points="3,6 5,6 21,6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                        `}
                    </div>
                </div>
            </div>
            
            ${expandedCategories[category.id] ? `
                <div class="space-y-4 ml-4 sortable-container">
                    ${category.questions.length === 0 ? `
                        <div class="empty-state p-8 text-center">
                            <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            <p class="text-gray-500 mb-4">此類別尚無問題</p>
                            <button onclick="addQuestion('${category.id}')" class="btn-modern btn-success px-6 py-3">
                                新增問題
                            </button>
                        </div>
                    ` : category.questions.map((question, questionIndex) => `
                        <div class="question-item p-4 sortable-item draggable" 
                             draggable="true"
                             ondragstart="handleQuestionDragStart(event, '${category.id}', ${questionIndex})"
                             ondragend="handleQuestionDragEnd(event)"
                             ondragover="handleQuestionDragOver(event)"
                             ondrop="handleQuestionDrop(event, '${category.id}', ${questionIndex})">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex items-center space-x-3 flex-1">
                                    <!-- 問題拖拽手柄 -->
                                    <div class="drag-handle p-1" title="拖拽移動問題">
                                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                            <line x1="3" y1="6" x2="21" y2="6"/>
                                            <line x1="3" y1="12" x2="21" y2="12"/>
                                            <line x1="3" y1="18" x2="21" y2="18"/>
                                        </svg>
                                    </div>
                                    <button onclick="toggleQuestion('${question.id}')" class="btn-modern p-2">
                                        <svg class="icon transition-transform" viewBox="0 0 24 24">
                                            ${expandedQuestions[question.id] ? 
                                                '<polyline points="6,9 12,15 18,9"></polyline>' : 
                                                '<polyline points="9,18 15,12 9,6"></polyline>'
                                            }
                                        </svg>
                                    </button>
                                    ${editingQuestion === question.id ? 
                                        `<div class="flex-1 space-y-2">
                                            <input type="text" value="${question.question}"
                                                   class="input-modern font-semibold w-full"
                                                   placeholder="輸入問題標題"
                                                   id="edit-q-${question.id}">
                                            <input type="text" value="${escapeHtml(question.subCategory || '')}"
                                                   class="input-modern w-full text-sm"
                                                   placeholder="子類別（選填，例如：新生）"
                                                   id="edit-sub-${question.id}">
                                        </div>` :
                                        `<div class="flex-1">
                                            <h4 class="font-semibold text-gray-800">${question.question || '未命名問題'}</h4>
                                            ${question.subCategory ? `<span class="inline-block mt-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">${escapeHtml(question.subCategory)}</span>` : ''}
                                        </div>`
                                    }
                                    <span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg font-mono">
                                        ${question.id}
                                    </span>
                                </div>
                                <div class="flex items-center space-x-1 ml-3">
                                    ${editingQuestion === question.id ? `
                                        <button onclick="saveQuestionFromInput('${category.id}', '${question.id}')" class="btn-modern btn-success p-2" title="儲存">
                                            <svg class="icon" viewBox="0 0 24 24">
                                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                                <polyline points="17,21 17,13 7,13 7,21"/>
                                                <polyline points="7,3 7,8 15,8"/>
                                            </svg>
                                        </button>
                                        <button onclick="cancelEdit()" class="btn-modern p-2 hover:bg-gray-50" title="取消">
                                            <svg class="icon" viewBox="0 0 24 24">
                                                <line x1="18" y1="6" x2="6" y2="18"/>
                                                <line x1="6" y1="6" x2="18" y2="18"/>
                                            </svg>
                                        </button>
                                    ` : `
                                        <button onclick="editQuestion('${question.id}')" class="btn-modern p-2 hover:bg-blue-50 text-blue-600" title="編輯問題">
                                            <svg class="icon" viewBox="0 0 24 24">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                            </svg>
                                        </button>
                                        <button onclick="deleteQuestion('${category.id}', '${question.id}')" class="btn-modern btn-danger p-2" title="刪除問題">
                                            <svg class="icon" viewBox="0 0 24 24">
                                                <polyline points="3,6 5,6 21,6"/>
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                            </svg>
                                        </button>
                                    `}
                                </div>
                            </div>
                            
                            ${expandedQuestions[question.id] ? `
                                <div class="ml-10 mt-4">
                                    <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                        ${editingQuestion === question.id ? 
                                            `<div class="space-y-3">
                                                <textarea id="answer-${question.id}" class="input-modern w-full min-h-[120px] resize-none" placeholder="輸入答案內容（網址會自動轉換為超連結）">${question.answer.replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')}</textarea>
                                                <div class="flex space-x-2">
                                                    <button onclick="saveQuestionFromInput('${category.id}', '${question.id}')" class="btn-modern btn-success px-4 py-2 text-sm">
                                                        儲存
                                                    </button>
                                                    <button onclick="cancelEdit()" class="btn-modern px-4 py-2 text-sm">
                                                        取消
                                                    </button>
                                                </div>
                                                <div class="text-xs text-gray-500">
                                                    💡 提示：直接輸入網址（如 https://example.com 或 www.example.com），儲存時會自動轉換為可點擊的超連結
                                                </div>
                                            </div>` :
                                            `<div class="text-gray-700 leading-relaxed whitespace-pre-line">${question.answer}</div>`
                                        }
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `).join('');

    // 自動聚焦到編輯中的元素
    setTimeout(() => {
        if (editingCategory) {
            const input = document.getElementById(`edit-cat-${editingCategory}`);
            if (input) {
                input.focus();
                input.select();
            }
        }
        if (editingQuestion) {
            const input = document.getElementById(`edit-q-${editingQuestion}`);
            if (input) {
                input.focus();
                input.select();
            }
        }
    }, 100);
}

// 渲染預覽模式
function renderPreview() {
    if (faqData.length === 0) {
        previewContainer.innerHTML = `
            <div class="empty-state text-center py-16">
                <div class="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <svg class="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                </div>
                <h3 class="text-xl font-semibold text-gray-600 mb-2">尚無內容</h3>
                <p class="text-gray-500">請先在編輯模式中新增類別和問題</p>
            </div>
        `;
        return;
    }

    previewContainer.innerHTML = faqData.map((category, index) => `
        <div class="card-modern mb-6 overflow-hidden">
            <button onclick="toggleCategory('preview_${category.id}')" 
                    class="w-full p-6 text-left bg-gray-50 hover:bg-gray-100 transition-all duration-200 flex items-center justify-between">
                <div class="flex items-center space-x-4">
                    <div class="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                        <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <div>
                        <h3 class="text-xl font-bold text-gray-800">
                            ${category.categoryName}
                        </h3>
                        <p class="text-sm text-gray-500">${category.questions.length} 個問題</p>
                    </div>
                </div>
                <svg class="icon-lg text-gray-400 transition-all" viewBox="0 0 24 24">
                    ${expandedCategories[`preview_${category.id}`] ? 
                        '<polyline points="6,9 12,15 18,9"></polyline>' : 
                        '<polyline points="9,18 15,12 9,6"></polyline>'
                    }
                </svg>
            </button>
            ${expandedCategories[`preview_${category.id}`] ? `
                <div class="p-6 space-y-4 bg-gray-50">
                    ${category.questions.map((question, qIndex) => `
                        ${question.subCategory && question.subCategory !== (category.questions[qIndex - 1] || {}).subCategory ? `<div class="pt-2 pb-1 text-sm font-semibold text-blue-700 border-b border-blue-100">${escapeHtml(question.subCategory)}</div>` : ''}
                        <div class="question-item">
                            <button onclick="toggleQuestion('preview_${question.id}')" 
                                    class="w-full p-4 text-left hover:bg-white transition-all duration-200 rounded-lg flex items-center justify-between">
                                <div class="flex items-center space-x-3">
                                    <div class="w-6 h-6 bg-green-500 rounded-lg flex items-center justify-center">
                                        <svg class="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                            <circle cx="12" cy="12" r="10"/>
                                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                                        </svg>
                                    </div>
                                    <span class="font-medium text-gray-800">
                                        ${question.question}
                                    </span>
                                </div>
                                <svg class="icon text-gray-400 transition-all" viewBox="0 0 24 24">
                                    ${expandedQuestions[`preview_${question.id}`] ? 
                                        '<polyline points="6,9 12,15 18,9"></polyline>' : 
                                        '<polyline points="9,18 15,12 9,6"></polyline>'
                                    }
                                </svg>
                            </button>
                            ${expandedQuestions[`preview_${question.id}`] ? `
                                <div class="ml-9 mr-6 mb-4 p-4 bg-white rounded-lg border border-gray-200">
                                    <div class="text-gray-700 leading-relaxed whitespace-pre-line">
                                        ${question.answer}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `).join('');
}

// 編輯類別
function editCategory(categoryId) {
    editingCategory = categoryId;
    renderEditMode();
}

// 編輯問題
function editQuestion(questionId) {
    editingQuestion = questionId;
    renderEditMode();
}

// 從輸入框儲存類別編輯
function saveCategoryFromInput(categoryId) {
    const categoryInput = document.getElementById(`edit-cat-${categoryId}`);
    const newName = categoryInput ? categoryInput.value : '';
    saveCategoryEdit(categoryId, newName);
}

// 從輸入框儲存問題編輯
function saveQuestionFromInput(categoryId, questionId) {
    const questionInput = document.getElementById(`edit-q-${questionId}`);
    const answerInput = document.getElementById(`answer-${questionId}`);
    const subInput = document.getElementById(`edit-sub-${questionId}`);
    const newQuestion = questionInput ? questionInput.value : '';
    const newAnswer = answerInput ? answerInput.value : '';
    const newSubCategory = subInput ? subInput.value : '';
    saveQuestionEdit(categoryId, questionId, newQuestion, newAnswer, newSubCategory);
}

// 取消編輯
function cancelEdit() {
    editingCategory = null;
    editingQuestion = null;
    renderEditMode();
}

// 切換模式
function toggleMode() {
    showPreview = !showPreview;
    if (showPreview) {
        editMode.style.display = 'none';
        previewMode.style.display = 'block';
        toggleModeBtn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span>編輯模式</span>
        `;
        renderPreview();
    } else {
        editMode.style.display = 'block';
        previewMode.style.display = 'none';
        toggleModeBtn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
            </svg>
            <span>預覽模式</span>
        `;
        renderEditMode();
    }
}

// 匯出JSON
function exportJSON() {
    const dataStr = JSON.stringify(faqData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `faq_${currentDepartment}_${new Date().toISOString().split('T')[0]}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    // 顯示成功提示
    showNotification('匯出成功！', 'success');
}

// 匯入JSON
function importJSON(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                const validationError = validateFaqData(importedData);
                if (validationError) {
                    showNotification('匯入失敗：' + validationError, 'error');
                    return;
                }
                faqData = importedData;
                
                // 自動偵測部門代碼
                if (faqData.length > 0) {
                    const firstId = faqData[0].id;
                    const detectedDepartment = extractDepartmentCode(firstId);
                    if (departments[detectedDepartment]) {
                        currentDepartment = detectedDepartment;
                        departmentSelect.value = currentDepartment;
                        updateDepartmentInfo();
                    }
                }
                
                expandedCategories = {};
                expandedQuestions = {};
                editingCategory = null;
                editingQuestion = null;
                renderEditMode();
                renderPreview();
                showNotification('匯入成功！', 'success');
            } catch (error) {
                showNotification('匯入失敗：不是有效的 JSON 檔案', 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // 讓同一個檔案可以再次選取
    }
}

// 匯入 txt 原稿（各單位交來的 FAQ 文字檔）
function importTxt(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = decodeTextFile(e.target.result);
            const result = parseFaqText(text, currentDepartment, { linkify: convertUrlsToLinks });
            if (result.data.length === 0) {
                showNotification('匯入失敗：找不到【類別】，請確認檔案格式', 'error');
                return;
            }
            if (faqData.length > 0 && !confirm('匯入 txt 會取代目前編輯器裡的所有內容，確定嗎？\n（建議先按「匯出」備份）')) {
                return;
            }
            const validationError = validateFaqData(result.data);
            if (validationError) {
                showNotification('匯入失敗：' + validationError, 'error');
                return;
            }
            faqData = result.data;
            expandedCategories = {};
            expandedQuestions = {};
            editingCategory = null;
            editingQuestion = null;
            window.lastTxtImportWarnings = result.warnings;
            if (result.warnings.length > 0) console.warn('txt 匯入提醒：\n' + result.warnings.join('\n'));
            renderEditMode();
            renderPreview();
            const s = result.stats;
            let msg = `匯入成功：${s.categories} 個類別、${s.questions} 題`;
            if (s.emptyAnswers > 0) msg += `（${s.emptyAnswers} 題沒有回答，詳見 F12 主控台）`;
            showNotification(msg, 'success');
        } catch (error) {
            console.error(error);
            showNotification('匯入失敗：無法讀取檔案', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

// 顯示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="flex items-center space-x-3">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                ${type === 'success' ? '<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>' :
                  type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' :
                  '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'}
            </svg>
            <span class="font-medium">${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// 綁定事件監聽器
function bindEventListeners() {
    if (toggleModeBtn) toggleModeBtn.addEventListener('click', toggleMode);
    if (addCategoryBtn) addCategoryBtn.addEventListener('click', addCategory);
    if (exportBtn) exportBtn.addEventListener('click', exportJSON);
    if (importBtn) importBtn.addEventListener('click', () => importInput.click());
    if (importInput) importInput.addEventListener('change', importJSON);
    const importTxtBtn = document.getElementById('importTxtBtn');
    const importTxtInput = document.getElementById('importTxtInput');
    if (importTxtBtn && importTxtInput) {
        importTxtBtn.addEventListener('click', () => importTxtInput.click());
        importTxtInput.addEventListener('change', importTxt);
    }
    
    // 綁定部門選擇事件
    if (departmentSelect) {
        departmentSelect.addEventListener('change', function(event) {
            currentDepartment = event.target.value;
            updateDepartmentInfo();
            saveToStorage();
        });
    }
    
    // 綁定快速開始按鈕
    const quickStartBtn = document.getElementById('quickStartBtn');
    if (quickStartBtn) {
        quickStartBtn.addEventListener('click', addCategory);
    }
}

// DOM加載完成後初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    bindEventListeners();
    enableDragAndDrop(); // 啟用拖拽功能
    const restored = loadFromStorage(); // 還原上次暫存
    updateDepartmentInfo();
    renderEditMode();
    if (restored && faqData.length > 0) {
        departmentSelect.value = currentDepartment;
        updateDepartmentInfo();
        showNotification('已還原上次的編輯內容', 'info');
    }
});

// 全域函數暴露
window.toggleCategory = toggleCategory;
window.toggleQuestion = toggleQuestion;
window.addQuestion = addQuestion;
window.editCategory = editCategory;
window.editQuestion = editQuestion;
window.deleteCategory = deleteCategory;
window.deleteQuestion = deleteQuestion;
window.saveCategoryFromInput = saveCategoryFromInput;
window.saveQuestionFromInput = saveQuestionFromInput;
window.cancelEdit = cancelEdit;