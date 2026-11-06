// 各單位 FAQ 原稿（txt）解析器
//
// 原稿格式：
//   【類別】                ← 單獨一行
//   〔子類別〕              ← 單獨一行（選填）
//   問題：xxx
//   回答：xxx（可多行）
//
// 轉成編輯器使用的格式：
//   [{ id, categoryName, questions: [{ id, question, answer, subCategory? }] }]

// 讀取檔案內容：先嘗試 UTF-8，失敗再用 Big5（舊版 Windows 文字檔常見）
function decodeTextFile(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes);
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
        return new TextDecoder('big5').decode(bytes);
    }
}

// 解析原稿。回傳 { data, warnings, stats }
//   deptCode：組別代碼，用來產生 ID（例如 shsd）
//   options.linkify：答案轉換網址的函式（編輯器傳入 convertUrlsToLinks）
function parseFaqText(text, deptCode, options = {}) {
    const linkify = options.linkify || (s => s);
    const warnings = [];
    const cats = [];
    const ANSWER_START = [/^※/, /^\d+\s*[.、．)）]/, /^[^\s：:]{1,10}[：:]$/];
    const looksLikeAnswerStart = (s) => ANSWER_START.some(re => re.test(s));
    let cat = null;
    let sub = '';
    let q = null;
    let field = null; // 目前正在累積的欄位：'question' 或 'answer'

    const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');

    const startCategory = (name) => {
        cat = { name, questions: [] };
        cats.push(cat);
        sub = '';
        q = null;
        field = null;
    };

    lines.forEach((raw, i) => {
        const lineNo = i + 1;
        const s = raw.trim();

        // 【類別】必須單獨一行。像「【操作步驟】於學校首頁…」這種後面還有文字的是備註，不算類別
        let m = s.match(/^【([^】]+)】$/);
        if (m) { startCategory(m[1].trim()); return; }

        m = s.match(/^〔([^〕]+)〕$/);
        if (m) {
            if (!cat) startCategory('未分類');
            sub = m[1].trim();
            q = null;
            field = null;
            return;
        }

        m = s.match(/^問題[：:]\s*(.*)$/);
        if (m) {
            if (!cat) {
                startCategory('未分類');
                warnings.push(`第 ${lineNo} 行：問題前面沒有【類別】，已放入「未分類」`);
            }
            q = { question: m[1], answer: '', sub, line: lineNo };
            cat.questions.push(q);
            field = 'question';
            return;
        }

        m = s.match(/^回答[：:]\s*(.*)$/);
        if (m) {
            if (!q) {
                warnings.push(`第 ${lineNo} 行：「回答」前面沒有「問題」，已略過`);
                return;
            }
            q.answer = m[1];
            field = 'answer';
            return;
        }

        // 其他行：接在目前欄位後面（答案可以多行）
        if (q && field) {
            if (field === 'question') {
                if (!s) return;
                if (looksLikeAnswerStart(s)) {
                    q.answer = raw.replace(/\s+$/, '');
                    field = 'answer';
                    warnings.push(`第 ${lineNo} 行：「${q.question.slice(0, 20)}」沒有「回答：」，已從這行起視為答案`);
                } else {
                    q.question += ' ' + s;
                }
            } else {
                q.answer += '\n' + raw.replace(/\s+$/, '');
            }
        } else if (s && cat) {
            warnings.push(`第 ${lineNo} 行：不屬於任何問題的文字，已略過：${s.slice(0, 30)}`);
        }
        // 第一個【類別】之前的行（例如單位名稱）直接略過
    });

    // 整理成編輯器格式
    let emptyAnswers = 0;
    let withSub = 0;
    const data = cats.map((c, ci) => {
        const n = ci + 1;
        const seen = new Set();
        return {
            id: `${deptCode}_c${n}_${n}`,
            categoryName: c.name,
            questions: c.questions.map((item, qi) => {
                const answer = item.answer.replace(/\n{3,}/g, '\n\n').trim();
                const question = item.question.trim();
                if (!answer) {
                    emptyAnswers++;
                    warnings.push(`第 ${item.line} 行：「${question.slice(0, 20)}」沒有回答（可能是小標題）`);
                }
                const key = item.sub + '|' + question;
                if (seen.has(key)) warnings.push(`第 ${item.line} 行：同一組內有重複的問題「${question.slice(0, 20)}」`);
                seen.add(key);

                const out = {
                    id: `${deptCode}_c${n}_${n}${qi + 1}`,
                    question,
                    answer: linkify(answer)
                };
                if (item.sub) { out.subCategory = item.sub; withSub++; }
                return out;
            })
        };
    });

    const questionCount = data.reduce((sum, c) => sum + c.questions.length, 0);
    return {
        data,
        warnings,
        stats: { categories: data.length, questions: questionCount, withSub, emptyAnswers }
    };
}

if (typeof module !== 'undefined') module.exports = { parseFaqText, decodeTextFile };
