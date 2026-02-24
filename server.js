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
        subjectText = 'random subjects: Mathematics, Physics, Chemistry, Biology, Literature, English, History, Geography';
        specificRequirements = '- For each subject, ensure questions are age-appropriate for grade ' + grade;
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
        
        // Thêm yêu cầu cụ thể theo môn học
        specificRequirements = getSubjectSpecificRequirements(subject, grade);
    }

    return `You are an expert Vietnamese teacher with 20 years of experience. Create ${num} multiple choice questions for grade ${grade} students in Vietnam, focusing on ${subjectText}.

CRITICAL REQUIREMENTS - MUST FOLLOW EXACTLY:
1. Return ONLY valid JSON, no explanations, no markdown, no additional text
2. JSON format STRICTLY:
{
  "questions": [
    {
      "subject": "Subject Name (exactly as provided)",
      "text": "Clear question text with proper grammar",
      "options": ["A. Option A", "B. Option B", "C. Option C", "D. Option D"],
      "answer": "A"
    }
  ]
}

EDUCATIONAL STANDARDS:
- Questions must align with Vietnamese Ministry of Education curriculum for grade ${grade}
- Difficulty level: mix of easy (30%), medium (50%), and challenging (20%)
- Questions must be factually accurate and unambiguous
- Each question should test ONE specific concept or skill
- Avoid culturally insensitive content
- Use age-appropriate language for grade ${grade} students

${specificRequirements}

QUESTION FORMAT RULES:
- Each question MUST have exactly 4 options (A, B, C, D)
- Options must be plausible but only one correct
- Avoid "all of the above" or "none of the above" unless absolutely necessary
- Distractors (wrong answers) should be common misconceptions
- Answer must be exactly "A", "B", "C", or "D"

DISTRIBUTION REQUIREMENTS:
- Correct answers must be evenly distributed: ${Math.floor(num/4)} questions per letter (A, B, C, D)
- If ${num} is not divisible by 4, distribute remainder randomly but ensure balance

VERIFICATION STEPS (check before returning):
- Verify each question has exactly 4 options
- Verify each option starts with "A.", "B.", "C.", or "D."
- Verify answer matches one of the options
- Verify no duplicate or similar questions
- Verify all content is appropriate for grade ${grade}
- Double-check factual accuracy

QUALITY CHECK:
- Questions should be engaging and clear
- Avoid trick questions
- Ensure consistent difficulty across all questions

Remember: Return ONLY the JSON object, no other text.`;
}

function getSubjectSpecificRequirements(subject, grade) {
    const requirements = {
        'Toán': `- Focus on grade ${grade} math concepts (arithmetic, geometry, algebra, measurement)
- Include both computational and word problems
- Ensure numbers and operations are appropriate for grade ${grade}
- Use real-life examples where applicable`,
        
        'Lý': `- Focus on fundamental physics concepts for grade ${grade}
- Include everyday examples and observations
- Ensure no advanced formulas beyond grade ${grade} level`,
        
        'Hóa': `- Focus on basic chemistry concepts for grade ${grade}
- Include safety awareness where relevant
- Emphasize real-world applications`,
        
        'Văn': `- Use age-appropriate literary excerpts
- Focus on reading comprehension, vocabulary, and basic literary analysis
- Questions should test understanding, not memorization`,
        
        'Anh': `- Use grade ${grade} appropriate vocabulary and grammar
- Include reading comprehension, grammar, and vocabulary questions
- Ensure all English text is grammatically correct`,
        
        'Sử': `- Focus on historical facts appropriate for grade ${grade}
- Include both Vietnamese and world history as per curriculum
- Ensure dates and events are accurate`,
        
        'Địa': `- Focus on geographical concepts for grade ${grade}
- Include map reading skills where applicable
- Cover both physical and human geography`
    };
    
    return requirements[subject] || '- Follow standard curriculum guidelines for this subject';
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
