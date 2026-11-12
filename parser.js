// 各單位 FAQ 原稿（txt）解析器
//
// 原稿格式：
//   【類別】                ← 單獨一行
//   〔分組〕                ← 單獨一行（例如〔新生〕〔舊生〕〔校外人士〕），它底下的問題都屬於這個分組
//   問題：xxx
//   回答：xxx（可多行）
//
// 轉成編輯器使用的格式（類別 → 分組 → 問題）：
//   [{ id, categoryName,
//      questions: [{ id, question, answer }],                 ← 沒有放進任何分組的問題
//      groups: [{ id, groupName, questions: [{ id, question, answer }] }]   ← 有分組才會有這一項
//   }]

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
    let group = null;   // 目前所在的分組（null = 還沒遇到〔分組〕，問題直接放在類別底下）
    let q = null;
    let field = null; // 目前正在累積的欄位：'question' 或 'answer'

    const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');

    const startCategory = (name) => {
        cat = { name, questions: [], groups: [] };
        cats.push(cat);
        group = null;
        q = null;
        field = null;
    };

    lines.forEach((raw, i) => {
        const lineNo = i + 1;
        const s = raw.trim();

        // 【類別】必須單獨一行。像「【操作步驟】於學校首頁…」這種後面還有文字的是備註，不算類別
        let m = s.match(/^【([^】]+)】$/);
        if (m) { startCategory(m[1].trim()); return; }

        // 〔文字〕單獨一行 → 開始一個新的分組，後面的問題都放進這個分組
        m = s.match(/^〔([^〕]+)〕$/);
        if (m) {
            if (!cat) {
                startCategory('未分類');
                warnings.push(`第 ${lineNo} 行：〔${m[1].trim()}〕前面沒有【類別】，已放入「未分類」`);
            }
            group = { name: m[1].trim(), items: [], line: lineNo };
            cat.groups.push(group);
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
            q = { question: m[1], answer: '', line: lineNo };
            (group ? group.items : cat.questions).push(q);
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
    let groupCount = 0;
    let questionCount = 0;
    const data = cats.map((c, ci) => {
        const n = ci + 1;
        let qNumber = 0;   // 這個類別裡的問題流水號（直屬問題和各分組的問題一起編號，ID 不會重複）

        // 把一串原稿問題轉成輸出格式（seen 用來檢查同一串裡有沒有重複的問題）
        const convert = (items) => {
            const seen = new Set();
            return items.map(item => {
                qNumber++;
                questionCount++;
                const answer = item.answer.replace(/\n{3,}/g, '\n\n').trim();
                const question = item.question.trim();
                if (!answer) {
                    emptyAnswers++;
                    warnings.push(`第 ${item.line} 行：「${question.slice(0, 20)}」沒有回答（可能是小標題）`);
                }
                if (seen.has(question)) warnings.push(`第 ${item.line} 行：同一組內有重複的問題「${question.slice(0, 20)}」`);
                seen.add(question);
                return { id: `${deptCode}_c${n}_${n}${qNumber}`, question, answer: linkify(answer) };
            });
        };

        const result = {
            id: `${deptCode}_c${n}_${n}`,
            categoryName: c.name,
            questions: convert(c.questions)
        };
        if (c.groups.length > 0) {
            result.groups = c.groups.map((g, gi) => {
                groupCount++;
                if (g.items.length === 0) warnings.push(`第 ${g.line} 行：〔${g.name}〕底下沒有任何問題`);
                return { id: `${deptCode}_c${n}_g${gi + 1}`, groupName: g.name, questions: convert(g.items) };
            });
        }
        return result;
    });

    return {
        data,
        warnings,
        stats: { categories: data.length, questions: questionCount, groups: groupCount, emptyAnswers }
    };
}

if (typeof module !== 'undefined') module.exports = { parseFaqText, decodeTextFile };
