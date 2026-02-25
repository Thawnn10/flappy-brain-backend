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
- Các câu hỏi không lặp lại với các câu đã tạo trước
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
        'Toán': `YÊU CẦU CHO MÔN TOÁN LỚP ${grade} - ĐA DẠNG DẠNG BÀI THEO SGK:

A. CẤU TRÚC MẠCH KIẾN THỨC (theo chương trình mới):

1. SỐ VÀ ĐẠI SỐ (40% câu hỏi)
2. HÌNH HỌC VÀ ĐO LƯỜNG (30% câu hỏi)
3. THỐNG KÊ VÀ XÁC SUẤT (20% câu hỏi) 
4. HOẠT ĐỘNG THỰC HÀNH VÀ TRẢI NGHIỆM (10% câu hỏi) - các bài toán gắn với thực tiễn 

A. CÁC DẠNG BÀI CỤ THỂ THEO TỪNG KHỐI LỚP:

------------------------
LỚP 1:
- Đếm số, đọc số, viết số
- So sánh số (>, <, =)
- Cộng trừ trong phạm vi 10, 20
- Nhận biết hình vuông, hình tròn, hình tam giác
- Xem đồng hồ (giờ đúng)
- Bài toán "thêm", "bớt" đơn giản

------------------------
LỚP 2:
- Cộng trừ có nhớ trong phạm vi 100
- Bảng nhân 2,3,4,5
- Tìm số hạng, số bị trừ chưa biết
- Tính độ dài đường gấp khúc
- Nhận biết ngày, tháng
- Bài toán nhiều hơn, ít hơn

------------------------
LỚP 3:
- Bảng nhân 6,7,8,9
- Nhân, chia số có 2,3 chữ số
- Tính giá trị biểu thức (có dấu ngoặc)
- Tính chu vi hình chữ nhật, hình vuông
- Xem đồng hồ (chính xác đến phút)
- Bài toán rút về đơn vị
- Bài toán liên quan đến gấp/giảm số lần

------------------------
LỚP 4:
- Phép nhân, chia số có nhiều chữ số
- Dấu hiệu chia hết cho 2,3,5,9
- Phân số: so sánh, cộng trừ phân số
- Tính diện tích hình bình hành, hình thoi
- Tìm hai số khi biết tổng và hiệu
- Bài toán tìm số trung bình cộng
- Bài toán về tỉ lệ bản đồ

------------------------
LỚP 5:
- Hỗn số, số thập phân
- Cộng trừ nhân chia số thập phân
- Tỉ số phần trăm (tính %, tìm % của số)
- Tính diện tích hình thang, hình tròn
- Tính thể tích hình hộp chữ nhật
- Bài toán chuyển động đều
- Bài toán về vòi nước chảy

------------------------
LỚP 6:
- Tập hợp, phần tử
- Lũy thừa, thứ tự thực hiện phép tính
- Số nguyên, cộng trừ nhân chia số nguyên
- Phân số bằng nhau, rút gọn phân số
- Các phép tính về phân số
- Hỗn số, số thập phân, phần trăm
- Ba điểm thẳng hàng, tia, đường thẳng
- Đoạn thẳng, độ dài đoạn thẳng
- Góc, số đo góc

------------------------
LỚP 7:
- Số hữu tỉ, cộng trừ nhân chia số hữu tỉ
- Lũy thừa của số hữu tỉ
- Tỉ lệ thức, tính chất dãy tỉ số bằng nhau
- Số thập phân vô hạn, làm tròn số
- Căn bậc hai
- Đại lượng tỉ lệ thuận, tỉ lệ nghịch
- Biểu thức đại số, đơn thức, đa thức
- Hai góc đối đỉnh, hai đường thẳng song song
- Tổng ba góc của tam giác
- Các trường hợp bằng nhau của tam giác

------------------------
LỚP 8:
- Nhân chia đa thức
- Hằng đẳng thức đáng nhớ
- Phân tích đa thức thành nhân tử
- Phân thức đại số, tính chất cơ bản
- Phương trình bậc nhất một ẩn
- Bất phương trình bậc nhất một ẩn
- Định lý Pythagore
- Tứ giác, hình thang, hình bình hành
- Hình chữ nhật, hình thoi, hình vuông
- Diện tích đa giác

------------------------
LỚP 9:
- Căn thức bậc hai, bậc ba
- Hàm số bậc nhất y = ax + b
- Hệ hai phương trình bậc nhất hai ẩn
- Hàm số y = ax² (a ≠ 0)
- Phương trình bậc hai một ẩn
- Hệ thức Vi-ét và ứng dụng
- Góc ở tâm, góc nội tiếp
- Tứ giác nội tiếp
- Độ dài đường tròn, cung tròn
- Diện tích hình tròn, hình quạt
- Hình trụ, hình nón, hình cầu

------------------------
LỚP 10:
- Mệnh đề, tập hợp
- Bất phương trình, hệ bất phương trình bậc nhất
- Hệ thức lượng trong tam giác
- Tích vô hướng của hai vectơ
- Phương trình đường thẳng, đường tròn
- Ba đường conic
- Hàm số bậc hai, đồ thị
- Dấu của tam thức bậc hai
- Thống kê (tần số, tần suất)
- Công thức lượng giác

------------------------
LỚP 11:
- Hàm số lượng giác, phương trình lượng giác
- Tổ hợp, xác suất
- Nhị thức Newton
- Cấp số cộng, cấp số nhân
- Giới hạn dãy số, hàm số
- Hàm số liên tục
- Đạo hàm, ý nghĩa của đạo hàm
- Phép dời hình, phép đồng dạng
- Đường thẳng vuông góc với mặt phẳng
- Góc trong không gian

------------------------
LỚP 12:
- Tính đơn điệu của hàm số
- Cực trị của hàm số
- Giá trị lớn nhất, nhỏ nhất
- Đường tiệm cận
- Khảo sát hàm số
- Lũy thừa, logarit
- Nguyên hàm, tích phân
- Ứng dụng tích phân tính diện tích, thể tích
- Số phức
- Hình học không gian Oxyz
- Khối đa diện, thể tích khối đa diện
- Mặt nón, mặt trụ, mặt cầu

B. VÍ DỤ CỤ THỂ TỪNG DẠNG BÀI (LỚP 5 VÀ LỚP 9):

----- LỚP 5 - DẠNG SỐ THẬP PHÂN -----
Câu hỏi: Số thập phân 35,708 đọc là:
A. Ba mươi lăm phẩy bảy trăm linh tám
B. Ba mươi lăm phẩy bảy không tám
C. Ba năm phẩy bảy trăm linh tám
D. Ba mươi năm phẩy bảy trăm linh tám

----- LỚP 5 - DẠNG TỈ SỐ PHẦN TRĂM -----
Câu hỏi: Một cửa hàng bán một chiếc xe đạp giá 1.500.000 đồng, được lãi 20% so với giá vốn. Hỏi giá vốn của chiếc xe đạp là bao nhiêu?
A. 1.200.000 đồng
B. 1.250.000 đồng
C. 1.300.000 đồng
D. 1.800.000 đồng

----- LỚP 5 - DẠNG CHUYỂN ĐỘNG -----
Câu hỏi: Một người đi xe máy từ A lúc 7 giờ 30 phút và đến B lúc 9 giờ. Vận tốc trung bình là 40 km/giờ. Quãng đường AB dài:
A. 60 km
B. 70 km
C. 80 km
D. 100 km

----- LỚP 9 - DẠNG CĂN THỨC -----
Câu hỏi: Rút gọn biểu thức √(9a²) với a < 0 được kết quả là:
A. 3a
B. -3a
C. 9a
D. -9a

----- LỚP 9 - DẠNG HỆ PHƯƠNG TRÌNH -----
Câu hỏi: Nghiệm của hệ phương trình {x + y = 5; 2x - y = 1} là:
A. (2;3)
B. (3;2)
C. (1;4)
D. (4;1)

----- LỚP 9 - DẠNG TỨ GIÁC NỘI TIẾP -----
Câu hỏi: Cho tứ giác ABCD nội tiếp đường tròn. Biết góc A = 80°, góc B = 70°. Tính góc C?
A. 80°
B. 90°
C. 100°
D. 110°

----- LỚP 9 - DẠNG HÌNH TRỤ -----
Câu hỏi: Một hình trụ có bán kính đáy 3cm, chiều cao 5cm. Thể tích của hình trụ là:
A. 45π cm³
B. 30π cm³
C. 15π cm³
D. 60π cm³

C. CÁC DẠNG BÀI CẦN CÓ TRONG BỘ CÂU HỎI:

1. Dạng tính toán đơn thuần (20%) - nhưng là tính toán theo đặc thù lớp
2. Dạng trắc nghiệm lý thuyết (15%) - chọn khái niệm đúng, điền vào chỗ trống
3. Dạng bài tập có lời văn (30%) - tình huống thực tế
4. Dạng hình học (20%) - tính toán, nhận biết, quan hệ
5. Dạng bài tập đồ thị, bảng biểu (10%) - đọc hiểu số liệu
6. Dạng suy luận logic (5%) - tìm quy luật, điền số còn thiếu

D. YÊU CẦU KIỂM TRA ĐA DẠNG:

Trước khi tạo, hãy tự kiểm tra: 
- Câu hỏi có đúng dạng bài trong SGK lớp ${grade} không?
- Có phải chỉ toàn "tính: 5+7" không? - Nếu có thì SAI
- Có ít nhất 3-4 dạng bài khác nhau trong bộ câu hỏi không?
- Có đủ các mạch kiến thức (số học, hình học, đo lường, thống kê) không?
- Có câu hỏi lý thuyết không?

Lưu ý: Tránh lặp lại cùng một dạng bài quá nhiều lần

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
        
        'Lý': `YÊU CẦU RIÊNG CHO MÔN VẬT LÝ cho lớp ${grade}:
- Tập trung vào các khái niệm vật lý cơ bản cho lớp ${grade}
- Sử dụng các ví dụ từ đời sống hàng ngày
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Tránh các công thức phức tạp vượt quá trình độ lớp ${grade}
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Chú trọng hiện tượng vật lý và giải thích`,
        
        'Hóa': `YÊU CẦU RIÊNG CHO MÔN HÓA HỌC cho lớp ${grade}:
- Tập trung vào khái niệm hóa học cơ bản cho lớp ${grade}
- Chú ý an toàn trong phòng thí nghiệm (nếu có)
- Liên hệ với các ứng dụng thực tế
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Công thức hóa học đơn giản, phù hợp`,
        
        'Sinh': `YÊU CẦU RIÊNG CHO MÔN SINH HỌC cho lớp ${grade}:
- Tập trung vào kiến thức sinh học lớp ${grade}
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Liên quan đến cơ thể người, thực vật, động vật (tùy theo lớp)
- Sử dụng hình ảnh quen thuộc với học sinh
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Chú trọng các quá trình sinh học cơ bản`,
        
        'Văn': `YÊU CẦU RIÊNG CHO MÔN NGỮ VĂN cho lớp ${grade}:
- Sử dụng ngữ liệu phù hợp với lứa tuổi (có thể trích dẫn tác phẩm trong chương trình)
- Tập trung vào đọc hiểu, từ vựng, phân tích văn học cơ bản
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Câu hỏi kiểm tra khả năng hiểu, không phải học thuộc lòng
- Đảm bảo tính giáo dục và phù hợp thuần phong mỹ tục`,
        
        'Anh': `YÊU CẦU RIÊNG CHO MÔN TIẾNG ANH cho lớp ${grade}:
- Sử dụng từ vựng và ngữ pháp phù hợp lớp ${grade}
- Bao gồm câu hỏi đọc hiểu, ngữ pháp, từ vựng
- Tất cả nội dung tiếng Anh phải đúng ngữ pháp
- Sử dụng toàn bộ là tiếng Anh
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Câu hỏi đọc hiểu sử dụng đoạn văn ngắn, đơn giản`,
        
        'Sử': `YÊU CẦU RIÊNG CHO MÔN LỊCH SỬ cho lớp ${grade}:
- Tập trung vào sự kiện lịch sử phù hợp lớp ${grade}
- Bao gồm cả lịch sử Việt Nam và thế giới theo chương trình
- Đảm bảo tính chính xác của mốc thời gian và sự kiện
- Các câu hỏi đa dạng các dạng bài tránh lặp lại nhiều lần một dạng
- Phân bố độ khó : các câu hỏi ở mức bình thường so với trương trình của Bộ giáo dục đan xen vài câu hỏi khó 
- Câu hỏi nên giúp học sinh hiểu ý nghĩa lịch sử`,
        
        'Địa': `YÊU CẦU RIÊNG CHO MÔN ĐỊA LÝ cho lớp ${grade}:
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
- Câu hỏi đa dạng, không lặp lại cùng dạng bài
- Bám sát các dạng bài trong SGK lớp ${grade}
- Có cả lý thuyết và bài tập
- Có cả tính toán và suy luận
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
