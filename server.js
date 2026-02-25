require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== MIDDLEWARE ==========
app.use(helmet());
app.use(cors({
    origin: [
        'http://localhost:5500',           // Live Server
        'http://127.0.0.1:5500',
        'http://localhost:8000',            // Python server
        'http://127.0.0.1:8000',
        'https://thawnn10.github.io/FlappyBrainAI/',  // GitHub Pages
        'https://flappy-brain-backend.onrender.com',
        'https://thawnn10.github.io',
        'https://thawnn10.github.io/FlappyBrainAI/'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// ========== ROUTES ==========

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Flappy Brain Backend',
        version: '1.1.0',
        timestamp: new Date().toISOString(),
        endpoints: [
            'GET /api/health',
            'POST /api/generate-questions',
            'POST /api/explain-answer'
        ]
    });
});

// Generate questions
app.post('/api/generate-questions', async (req, res) => {
    console.log('📥 Received question generation request...');
    
    try {
        const { grade, subject, num = 20 } = req.body;
        
        // Validation
        if (!grade || !subject) {
            return res.status(400).json({
                success: false,
                error: 'Missing grade or subject'
            });
        }

        if (grade < 6 || grade > 12) {
            return res.status(400).json({
                success: false,
                error: 'Grade must be between 6 and 12'
            });
        }

        // Check API key
        if (!process.env.GROQ_API_KEY) {
            console.error('❌ No GROQ_API_KEY found in .env');
            return res.status(500).json({
                success: false,
                error: 'Server not configured properly'
            });
        }

        console.log(`📚 Generating: Grade ${grade}, Subject: ${subject}, Count: ${num}`);

        // Create prompt
        const prompt = createPrompt(grade, subject, num);
        
        // Call Groq API
        const aiResponse = await callGroqAPI(prompt);
        
        // Parse response
        const questions = parseAIResponse(aiResponse, num);
        
        console.log(`✅ Generated ${questions.length} questions`);
        
        res.json({
            success: true,
            count: questions.length,
            questions: questions
        });

    } catch (error) {
        console.error('❌ Backend error:', error.message);
        
        res.status(500).json({
            success: false,
            error: 'Failed to generate questions',
            message: error.message,
            fallback: true
        });
    }
});

// New endpoint for AI explanation
app.post('/api/explain-answer', async (req, res) => {
    console.log('📥 Received explanation request...');
    
    try {
        const { question, answer, userAnswer } = req.body;
        
        // Validation
        if (!question || !answer) {
            return res.status(400).json({
                success: false,
                error: 'Missing question or answer'
            });
        }

        // Check API key
        if (!process.env.GROQ_API_KEY) {
            console.error('❌ No GROQ_API_KEY found in .env');
            return res.status(500).json({
                success: false,
                error: 'Server not configured properly'
            });
        }

        console.log(`📝 Explaining answer...`);

        // Create explanation prompt
        const prompt = createExplanationPrompt(question, answer, userAnswer);
        
        // Call Groq API
        const aiResponse = await callGroqAPI(prompt);
        
        // Parse response
        const explanation = parseExplanation(aiResponse);
        
        console.log(`✅ Generated explanation`);
        
        res.json({
            success: true,
            explanation: explanation
        });

    } catch (error) {
        console.error('❌ Explanation error:', error.message);
        
        res.status(500).json({
            success: false,
            error: 'Failed to generate explanation',
            message: error.message
        });
    }
});

// ========== HELPER FUNCTIONS ==========
function createPrompt(grade, subject, num) {
    let subjectText = '';
    let specificRequirements = '';
    
    if (subject === 'all') {
        subjectText = 'các môn: Toán, Vật Lý, Hóa Học, Sinh Học, Ngữ Văn, Tiếng Anh, Lịch Sử, Địa Lý';
        specificRequirements = '- Với mỗi môn, đảm bảo câu hỏi phù hợp với lứa tuổi học sinh lớp ' + grade;
    } else {
        subjectText = `môn ${subject}`;
        specificRequirements = getSubjectSpecificRequirements(subject, grade);
    }

    return `Bạn là giáo viên dạy giỏi tại Việt Nam có hơn 20 năm kinh nghiệm. Hãy tạo ${num} câu hỏi trắc nghiệm cho học sinh lớp ${grade} tại Việt Nam, môn ${subjectText}.

YÊU CẦU QUAN TRỌNG - PHẢI TUÂN THỦ CHÍNH XÁC:
1. Chỉ trả về JSON hợp lệ, KHÔNG thêm giải thích, KHÔNG markdown, KHÔNG text nào khác
2. Định dạng JSON BẮT BUỘC:
{
  "questions": [
    {
      "subject": "Tên môn học (viết bằng tiếng Việt)",
      "text": "Nội dung câu hỏi rõ ràng, đúng chính tả",
      "options": ["A. Lựa chọn A", "B. Lựa chọn B", "C. Lựa chọn C", "D. Lựa chọn D"],
      "answer": "A"
    }
  ]
}

CHUẨN KIẾN THỨC:
- Câu hỏi phải bám sát chương trình của Bộ Giáo dục cho lớp ${grade}
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Câu hỏi phải chính xác về mặt kiến thức, không mơ hồ
- Mỗi câu hỏi chỉ kiểm tra MỘT khái niệm/kỹ năng cụ thể
- Nội dung phù hợp với lứa tuổi học sinh lớp ${grade}
- Sử dụng tiếng Việt chuẩn, đúng chính tả và ngữ pháp

${specificRequirements}

QUY TẮC ĐỊNH DẠNG CÂU HỎI:
- Mỗi câu hỏi PHẢI có đúng 4 lựa chọn (A, B, C, D)
- Các lựa chọn phải hợp lý nhưng chỉ có 1 đáp án đúng
- Tránh dùng "tất cả đáp án trên" hoặc "không có đáp án nào" trừ khi thật cần thiết
- Các lựa chọn sai nên là những lỗi sai phổ biến của học sinh
- Đáp án phải là chính xác "A", "B", "C", hoặc "D"

PHÂN BỐ ĐÁP ÁN:
- Đáp án đúng phải được phân bố đều: ${Math.floor(num/4)} câu cho mỗi chữ cái (A, B, C, D)
- Nếu ${num} không chia hết cho 4, phân bố số dư ngẫu nhiên nhưng đảm bảo cân bằng

KIỂM TRA CHẤT LƯỢNG (kiểm tra trước khi trả về):
- Đếm số lượng đáp án A, B, C, D có cân bằng không
- Đảm bảo mỗi câu có đúng 4 lựa chọn
- Đảm bảo mỗi lựa chọn bắt đầu bằng "A.", "B.", "C.", hoặc "D."
- Đảm bảo đáp án khớp với một trong các lựa chọn
- Không có câu hỏi trùng lặp hoặc quá giống nhau
- Tất cả nội dung phù hợp với học sinh lớp ${grade}
- Kiểm tra kỹ tính chính xác của kiến thức

VÍ DỤ CÂU HỎI TỐT:
{
  "subject": "Toán",
  "text": "Kết quả của phép tính 25 + 17 là:",
  "options": ["A. 32", "B. 42", "C. 52", "D. 62"],
  "answer": "B"
}

Lưu ý quan trọng: Chỉ trả về JSON, KHÔNG thêm bất kỳ text nào khác.`;
}

function getSubjectSpecificRequirements(subject, grade) {
    const requirements = {
        'Toán': `YÊU CẦU RIÊNG CHO MÔN TOÁN:
- Tập trung vào kiến thức toán lớp ${grade} (số học, hình học, đại số, đo lường)
- Các bài tập thật đa dạng không quá dễ cũng không khó đến mức bất khả thi đảm bảo tuyệt đối giống các dạng bài trong sách giáo khoa lớp ${grade}
- Số liệu và phép tính phù hợp tuyệt đối với trình độ lớp ${grade}
- Ưu tiên các ví dụ thực tế, gần gũi với học sinh tuyệt đối không sử dụng những câu tính toán cộng trừ nhân chia các số đối với các lớp 7 đến 12 
- Tuyệt đối tập trung vào các dạng bài có trong sách giáo khoa
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
A. CẤU TRÚC MẠCH KIẾN THỨC (theo chương trình mới):

1. SỐ VÀ ĐẠI SỐ (40% câu hỏi)
2. HÌNH HỌC VÀ ĐO LƯỜNG (30% câu hỏi)
3. THỐNG KÊ VÀ XÁC SUẤT (20% câu hỏi) 
4. HOẠT ĐỘNG THỰC HÀNH VÀ TRẢI NGHIỆM (10% câu hỏi) - các bài toán gắn với thực tiễn 

B. YÊU CẦU CẦN ĐẠT THEO TỪNG MẠCH KIẾN THỨC:

1. SỐ VÀ ĐẠI SỐ:
LỚP 1-5:
- Đọc, viết, so sánh, tính toán các số tự nhiên trong phạm vi phù hợp lớp học
- Nhận biết phân số, số thập phân (lớp 4-5)
- Tính giá trị biểu thức số có đến 2-3 phép tính
- Tìm thành phần chưa biết (x)

LỚP 6-7:
- Số nguyên, phân số, số thập phân, hỗn số
- Tỉ lệ thức, dãy tỉ số bằng nhau
- Biểu thức đại số, đơn thức, đa thức
- Phương trình bậc nhất một ẩn

LỚP 8-9:
- Căn bậc hai, căn bậc ba
- Hàm số bậc nhất, bậc hai và đồ thị
- Phương trình bậc hai, hệ phương trình bậc nhất hai ẩn
- Bất phương trình bậc nhất một ẩn

LỚP 10-12:
- Hàm số lũy thừa, mũ, logarit
- Đạo hàm, nguyên hàm, tích phân
- Số phức
- Phương pháp tọa độ trong mặt phẳng và không gian

2. HÌNH HỌC VÀ ĐO LƯỜNG:

LỚP 1-5:
- Nhận dạng hình phẳng, hình khối
- Tính chu vi, diện tích các hình đơn giản
- Đo độ dài, khối lượng, dung tích, thời gian
- Xác định vị trí, định hướng không gian

LỚP 6-7:
- Điểm, đường thẳng, tia, góc
- Quan hệ song song, vuông góc
- Tam giác, tứ giác (tính chất, diện tích)
- Hình hộp chữ nhật, hình lăng trụ đứng

LỚP 8-9:
- Định lý Pythagore
- Đường tròn (góc với đường tròn, tiếp tuyến)
- Hình đồng dạng
- Hình nón, hình trụ, hình cầu

LỚP 10-12:
- Vectơ trong mặt phẳng và không gian
- Phương pháp tọa độ trong mặt phẳng, không gian
- Quan hệ vuông góc trong không gian
- Khối đa diện, thể tích khối đa diện

3. THỐNG KÊ VÀ XÁC SUẤT: 

LỚP 1-5:
- Thu thập, phân loại dữ liệu đơn giản
- Đọc biểu đồ tranh, biểu đồ cột
- Nhận biết khả năng xảy ra (chắc chắn, có thể, không thể)

LỚP 6-7:
- Thu thập, phân tích dữ liệu
- Biểu đồ cột kép, biểu đồ đoạn thẳng
- Xác suất của biến cố đơn giản

LỚP 8-9:
- Bảng tần số, biểu đồ tần số
- Xác suất của biến cố trong các thí nghiệm đơn giản
- Giá trị trung bình, mốt, trung vị

LỚP 10-12:
- Quy tắc đếm, hoán vị, chỉnh hợp, tổ hợp
- Xác suất có điều kiện, xác suất toàn phần
- Biến ngẫu nhiên rời rạc, kỳ vọng, phương sai

4. HOẠT ĐỘNG THỰC HÀNH VÀ TRẢI NGHIỆM: 

LỚP 1-5:
- Bài toán mua bán, tính tiền
- Bài toán đo đạc thực tế
- Bài toán thời gian (giờ, ngày, tháng)
- Ứng dụng toán trong cuộc sống hàng ngày

LỚP 6-9:
- Bài toán thực tế về tỉ lệ, phần trăm (giảm giá, lãi suất)
- Bài toán đo đạc trong thực tế (chiều cao cây, tòa nhà)
- Bài toán về chuyển động, công việc
- Dự án nhỏ: thống kê, dự đoán

LỚP 10-12:
- Bài toán tối ưu (sản xuất, kinh doanh)
- Mô hình hóa toán học các tình huống thực tế
- Ứng dụng đạo hàm trong tối ưu hóa
- Bài toán lãi suất ngân hàng, đầu tư

C. VÍ DỤ MINH HỌA CỤ THỂ CHO LỚP ${grade}:

LỚP 1:
• Số 15 gồm mấy chục và mấy đơn vị?
• Hình nào là hình vuông?
• Đồng hồ chỉ mấy giờ?

LỚP 2:
• 23 + 15 = ?
• Điền dấu >, <, =: 45 ... 54
• Mẹ mua 12 quả cam, biếu bà 5 quả. Hỏi còn lại mấy quả?

LỚP 3:
• Tính: 125 + 234 = ?
• Hình chữ nhật có chiều dài 8cm, chiều rộng 5cm. Tính chu vi?
• Biểu đồ cột cho biết số học sinh thích các môn học

LỚP 4:
• 3/4 của 24 là bao nhiêu?
• 2,5 + 3,7 = ?
• Một cửa hàng bán 150kg gạo, đã bán được 2/5 số gạo. Hỏi còn lại bao kg?

LỚP 5:
• 25% của 200 là bao nhiêu?
• Tính diện tích hình thang có đáy lớn 8cm, đáy bé 5cm, cao 4cm
• Khả năng nào có thể xảy ra khi tung đồng xu?

LỚP 6:
• (-15) + 20 = ?
• Tìm x biết: 2x - 5 = 11
• Một lớp có 24 học sinh nam, 16 học sinh nữ. Tính tỉ số phần trăm học sinh nữ?

LỚP 7:
• Thu gọn đơn thức: 3x²y . (-2xy³)
• Cho tam giác ABC có góc A = 50°, góc B = 70°. Tính góc C?
• Biểu đồ đoạn thẳng biểu diễn nhiệt độ các ngày trong tuần

LỚP 8:
• Giải phương trình: x² - 5x + 6 = 0
• Tính cạnh huyền của tam giác vuông có hai cạnh góc vuông 6cm và 8cm
• Một xe máy đi từ A lúc 7h với vận tốc 40km/h, đến B lúc 9h. Tính quãng đường AB?

LỚP 9:
• Giải hệ phương trình: {x + y = 5; 2x - y = 1}
• Cho đường tròn (O) bán kính 5cm, dây AB = 6cm. Tính khoảng cách từ O đến AB
• Một hộp có 5 bi đỏ, 3 bi xanh. Lấy ngẫu nhiên 1 bi. Tính xác suất lấy được bi đỏ?

LỚP 10:
• Tìm tập xác định của hàm số y = √(x-3)
• Trong mặt phẳng Oxy, cho A(1,2), B(4,6). Tính độ dài AB
• Tung một con xúc xắc 2 lần. Tính xác suất tổng số chấm bằng 7

LỚP 11:
• Tính đạo hàm của f(x) = x³ - 3x² + 2x
• Có bao nhiêu cách xếp 5 bạn vào 5 ghế?
• Cho hình chóp S.ABCD có đáy là hình vuông. Chứng minh SA vuông góc với BD

LỚP 12:
• Tính nguyên hàm ∫(2x + 3)dx
• Tìm m để hàm số y = x³ - 3mx² + 3x đồng biến trên R
• Một người gửi 100 triệu với lãi suất 7%/năm. Tính số tiền sau 3 năm

D. ĐIỂM MỚI CỦA CHƯƠNG TRÌNH GDPT 2018 CẦN LƯU Ý:

1. Tăng cường tính ứng dụng thực tiễn: Ưu tiên các bài toán gắn với tình huống thực tế
2. Phát triển năng lực toán học: không chỉ kiểm tra kiến thức thuần túy
3. Tích hợp STEM: có thể kết hợp kiến thức với Khoa học, Công nghệ, Kỹ thuật
4. Tăng cường Thống kê và Xác suất: đây là mạch kiến thức mới được chú trọng
5. Hoạt động trải nghiệm: các bài toán mô phỏng tình huống thực tế

E. YÊU CẦU CHẤT LƯỢNG:

- Câu hỏi phải bám sát "Yêu cầu cần đạt" của chương trình GDPT 2018 cho lớp ${grade}
- Đảm bảo tính chính xác về mặt kiến thức
- Các lựa chọn sai là những lỗi học sinh thường mắc
- Mỗi câu hỏi chỉ kiểm tra 1 yêu cầu cần đạt cụ thể
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Có thể bao gồm: tính nhanh, tìm x, hình học cơ bản, phân số, số thập phân (tùy theo lớp)`,
        
        'Lý': `YÊU CẦU RIÊNG CHO MÔN VẬT LÝ:
- Tập trung vào các khái niệm vật lý cơ bản cho lớp ${grade}
- Sử dụng các ví dụ từ đời sống hàng ngày
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Tránh các công thức phức tạp vượt quá trình độ lớp ${grade}
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Chú trọng hiện tượng vật lý và giải thích`,
        
        'Hóa': `YÊU CẦU RIÊNG CHO MÔN HÓA HỌC:
- Tập trung vào khái niệm hóa học cơ bản cho lớp ${grade}
- Chú ý an toàn trong phòng thí nghiệm (nếu có)
- Liên hệ với các ứng dụng thực tế
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Công thức hóa học đơn giản, phù hợp`,
        
        'Sinh': `YÊU CẦU RIÊNG CHO MÔN SINH HỌC:
- Tập trung vào kiến thức sinh học lớp ${grade}
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Liên quan đến cơ thể người, thực vật, động vật (tùy theo lớp)
- Sử dụng hình ảnh quen thuộc với học sinh
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Chú trọng các quá trình sinh học cơ bản`,
        
        'Văn': `YÊU CẦU RIÊNG CHO MÔN NGỮ VĂN:
- Sử dụng ngữ liệu phù hợp với lứa tuổi (có thể trích dẫn tác phẩm trong chương trình)
- Tập trung vào đọc hiểu, từ vựng, phân tích văn học cơ bản
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Câu hỏi kiểm tra khả năng hiểu, không phải học thuộc lòng
- Đảm bảo tính giáo dục và phù hợp thuần phong mỹ tục`,
        
        'Anh': `YÊU CẦU RIÊNG CHO MÔN TIẾNG ANH:
- Sử dụng từ vựng và ngữ pháp phù hợp lớp ${grade}
- Bao gồm câu hỏi đọc hiểu, ngữ pháp, từ vựng
- Tất cả nội dung tiếng Anh phải đúng ngữ pháp
- Sử dụng toàn bộ là tiếng Anh
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Câu hỏi đọc hiểu sử dụng đoạn văn ngắn, đơn giản`,
        
        'Sử': `YÊU CẦU RIÊNG CHO MÔN LỊCH SỬ:
- Tập trung vào sự kiện lịch sử phù hợp lớp ${grade}
- Bao gồm cả lịch sử Việt Nam và thế giới theo chương trình
- Đảm bảo tính chính xác của mốc thời gian và sự kiện
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Câu hỏi nên giúp học sinh hiểu ý nghĩa lịch sử`,
        
        'Địa': `YÊU CẦU RIÊNG CHO MÔN ĐỊA LÝ:
- Tập trung vào khái niệm địa lý lớp ${grade}
- Có thể bao gồm kỹ năng đọc bản đồ
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Bao gồm cả địa lý tự nhiên và địa lý kinh tế - xã hội
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Sử dụng ví dụ cụ thể về các vùng miền ở Việt Nam`
    };
    
    return requirements[subject] || `YÊU CẦU RIÊNG CHO MÔN ${subject}:
- Tuân thủ tuyệt đối chương trình chuẩn của Bộ Giáo dục cho lớp ${grade}
- Nội dung phù hợp với lứa tuổi
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Đảm bảo tính tuyệt đối chính xác và giáo dục không thể xảy ra việc tạo câu hỏi sai`;
}
function createExplanationPrompt(question, correctAnswer, userAnswer = null) {
    const isCorrect = userAnswer === correctAnswer;
    
    return `You are a Vietnamese teacher. Please explain the following question and answer.

QUESTION: ${question.text}
SUBJECT: ${question.subject}
CORRECT ANSWER: ${correctAnswer}
${userAnswer ? `USER'S ANSWER: ${userAnswer} (${isCorrect ? 'CORRECT' : 'INCORRECT'})` : ''}

Please provide a clear, educational explanation in Vietnamese that:
1. Explains why the correct answer is right
2. Explains why other options are wrong (if applicable)
3. Provides additional context or examples to help understand the concept
4. Keep the explanation concise but informative (about 2-3 sentences)

Return ONLY the explanation text, no additional formatting or JSON.`;
}

async function callGroqAPI(prompt) {
    console.log('🤖 Calling Groq API...');
    
    try {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.3-70b-versatile',
                messages: [{ 
                    role: 'user', 
                    content: prompt 
                }],
                temperature: 0.7,
                max_tokens: 1024,
                response_format: prompt.includes('JSON') ? { type: "json_object" } : undefined
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );
        
        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Groq API Error:', error.response?.data || error.message);
        throw new Error(`Groq API failed: ${error.message}`);
    }
}

function parseAIResponse(content, num) {
    console.log('📝 Parsing AI response...');
    
    let parsedData;
    try {
        let jsonStr = content;
        // Remove markdown code blocks
        if (jsonStr.includes('```json')) {
            jsonStr = jsonStr.split('```json')[1] || jsonStr;
        }
        if (jsonStr.includes('```')) {
            jsonStr = jsonStr.split('```')[0];
        }
        
        parsedData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
        console.error('JSON Parse Error:', parseError.message);
        
        // Try to find JSON in string
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                parsedData = JSON.parse(jsonMatch[0]);
            } catch (e2) {
                throw new Error('Cannot parse AI response');
            }
        } else {
            throw new Error('No JSON found in response');
        }
    }
    
    // Extract questions
    let questions = [];
    if (parsedData.questions && Array.isArray(parsedData.questions)) {
        questions = parsedData.questions;
    } else if (Array.isArray(parsedData)) {
        questions = parsedData;
    } else if (parsedData.subject && parsedData.text) {
        questions = [parsedData];
    }
    
    // Validate each question
    const validQuestions = [];
    for (let q of questions) {
        if (!q || typeof q !== 'object') continue;
        if (!q.subject || !q.text || !Array.isArray(q.options)) continue;
        
        // Ensure 4 options
        if (q.options.length !== 4) continue;
        
        // Validate answer
        let answer = (q.answer || 'A').toString().toUpperCase().charAt(0);
        if (!['A', 'B', 'C', 'D'].includes(answer)) {
            answer = 'A';
        }
        
        validQuestions.push({
            subject: q.subject,
            text: q.text,
            options: q.options,
            answer: answer
        });
        
        if (validQuestions.length >= num) break;
    }
    
    return validQuestions.slice(0, num);
}

function parseExplanation(content) {
    console.log('📝 Parsing explanation...');
    
    // Remove markdown code blocks if present
    let explanation = content;
    if (explanation.includes('```')) {
        explanation = explanation.replace(/```[\s\S]*?```/g, '');
    }
    
    // Trim and clean up
    explanation = explanation.trim();
    
    // Ensure it's not empty
    if (!explanation) {
        explanation = "Xin lỗi, không thể tạo giải thích cho câu hỏi này. Vui lòng thử lại.";
    }
    
    return explanation;
}

// ========== ERROR HANDLING ==========

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Route not found',
        path: req.path,
        method: req.method,
        available: [
            'GET /api/health',
            'POST /api/generate-questions',
            'POST /api/explain-answer'
        ],
        timestamp: new Date().toISOString()
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('🔥 Server Error:', err.stack);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
        timestamp: new Date().toISOString()
    });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`🚀 Backend server running at: http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔐 API Key status: ${process.env.GROQ_API_KEY ? '✅ Loaded' : '❌ Missing'}`);
    console.log(`🌐 CORS enabled for: localhost:5500, localhost:8080`);
    console.log(`✨ New feature: AI Explanation endpoint available at /api/explain-answer`);
});
