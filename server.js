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
        'https://YOUR_USERNAME.github.io',  // GitHub Pages
        'https://flappy-brain-backend.onrender.com'
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
    
    if (subject === 'all') {
        subjectText = 'random subjects: Mathematics, Physics, Chemistry, Biology, Literature, English, History, Geography';
    } else {
        const subjectMap = {
            'Toán': 'Mathematics',
            'Lý': 'Physics', 
            'Hóa': 'Chemistry',
            'Sinh': 'Biology',
            'Văn': 'Literature',
            'Anh': 'English',
            'Sử': 'History',
            'Địa': 'Geography'
        };
        subjectText = `${subjectMap[subject] || subject} subject`;
    }

    return `You are a Vietnamese teacher. Create ${num} multiple choice questions for grade ${grade} in Vietnam, ${subjectText}.

IMPORTANT REQUIREMENTS:
1. Return ONLY JSON, no other text
2. JSON format:
{
  "questions": [
    {
      "subject": "Subject Name",
      "text": "Clear question text",
      "options": ["A. Option A", "B. Option B", "C. Option C", "D. Option D"],
      "answer": "A"
    }
  ]
}

RULES:
- Questions must follow Vietnamese curriculum for grade ${grade}
- Correct answers should be evenly distributed among A,B,C,D
- Each question must have 4 options
- Answer must be "A", "B", "C", or "D"
- Questions should be clear and unambiguous`;
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