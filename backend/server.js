const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

// NEW: Import the Google GenAI SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// NEW: Initialize the Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// === FIX 1: CHANGED MODEL NAME TO 'gemini-2.5-flash' TO AVOID 404 ERROR ===
const MODEL = "gemini-2.5-flash"; // A fast and capable model for these tasks

// Middleware - CORS Configuration for Render deployment
const corsOptions = {
    origin: '*', // Allow all origins for now
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// ==========================================
// DATABASE CONNECTION
// ==========================================

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'study_management',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test database connection
pool.getConnection()
    .then(connection => {
        console.log('✓ Database connected successfully');
        connection.release();
    })
    .catch(err => {
        console.error('✗ Database connection failed:', err.message);
        console.error('Please ensure MySQL is running and credentials in .env are correct');
    });

// ==========================================
// STUDY PLAN ROUTES
// ==========================================

// Generate Study Plan
app.post('/generate-study-plan', async (req, res) => {
    try {
        const { courseName, deadline, hoursPerDay } = req.body;

        if (!courseName || !deadline || !hoursPerDay) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Calculate days until deadline
        const deadlineDate = new Date(deadline);
        const today = new Date();
        const daysUntil = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
        const totalHours = daysUntil * hoursPerDay;

        if (daysUntil <= 0) {
            return res.status(400).json({ error: 'Deadline must be in the future' });
        }

        // **GEMINI API CALL for Study Plan**
        const prompt = `Generate a comprehensive ${daysUntil} day study plan for the course "${courseName}". The plan should be broken down into approximately ${Math.ceil(daysUntil / 7)} weekly phases. The total available study time is ${totalHours} hours, with an average of ${hoursPerDay} hours per day.
        
        The output MUST be a JSON array of objects.
        Each object in the array MUST have the following structure:
        {
          "week": [number, e.g., 1],
          "topic": [string, e.g., "Introduction and Fundamentals"],
          "hours": [number, The estimated hours for this week, ensuring the total hours across all weeks equals ${totalHours}],
          "tasks": [array of strings, e.g., ["Read chapters 1-3", "Complete practice exercises"]]
        }
        
        Do not include any other text, explanation, or markdown formatting outside of the JSON array.`;

        const model = genAI.getGenerativeModel({ model: MODEL });
        const aiResult = await model.generateContent(prompt);
        const response = await aiResult.response;
        const text = response.text();
        
        // The response text is a JSON string, so we parse it
        const planData = JSON.parse(text);

        // Insert into database
        const [result] = await pool.execute(
            `INSERT INTO study_plans 
             (user_id, course_name, deadline, hours_per_day, days_until, total_hours, plan_json, progress, completed) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [null, courseName, deadline, hoursPerDay, daysUntil, totalHours, JSON.stringify(planData), 0, false]
        );

        const studyPlan = {
            id: result.insertId,
            courseName,
            deadline,
            hoursPerDay,
            daysUntil,
            totalHours,
            plan: planData,
            progress: 0,
            completed: false,
            createdAt: new Date().toISOString()
        };

        res.json({ success: true, studyPlan });
    } catch (error) {
        console.error('Error generating study plan:', error);
        res.status(500).json({ error: 'Failed to generate study plan from AI. Check API key/model.' });
    }
});

// Get all study plans
app.get('/studyplans', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, course_name as courseName, deadline, hours_per_day as hoursPerDay, 
             days_until as daysUntil, total_hours as totalHours, plan_json as plan, 
             progress, completed, created_at as createdAt 
             FROM study_plans 
             ORDER BY created_at DESC`
        );

        const studyPlans = rows.map(row => ({
            ...row,
            plan: JSON.parse(row.plan)
        }));

        res.json({ success: true, studyPlans });
    } catch (error) {
        console.error('Error fetching study plans:', error);
        res.status(500).json({ error: 'Failed to fetch study plans' });
    }
});

// Update study plan progress
app.post('/update-study-progress', async (req, res) => {
    try {
        const { id, progress, completed } = req.body;

        await pool.execute(
            `UPDATE study_plans SET progress = ?, completed = ? WHERE id = ?`,
            [progress, completed, id]
        );

        const [rows] = await pool.execute(
            `SELECT id, course_name as courseName, deadline, hours_per_day as hoursPerDay, 
             days_until as daysUntil, total_hours as totalHours, plan_json as plan, 
             progress, completed, created_at as createdAt 
             FROM study_plans WHERE id = ?`,
            [id]
        );

        if (rows.length > 0) {
            const plan = {
                ...rows[0],
                plan: JSON.parse(rows[0].plan)
            };
            res.json({ success: true, plan });
        } else {
            res.status(404).json({ error: 'Study plan not found' });
        }
    } catch (error) {
        console.error('Error updating study progress:', error);
        res.status(500).json({ error: 'Failed to update progress' });
    }
});

// Delete study plan
app.delete('/studyplan/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await pool.execute(`DELETE FROM study_plans WHERE id = ?`, [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting study plan:', error);
        res.status(500).json({ error: 'Failed to delete study plan' });
    }
});

// ==========================================
// NOTES ROUTES
// ==========================================

// Upload PDF (mock)
app.post('/upload-pdf', async (req, res) => {
    try {
        const { fileName, fileContent } = req.body;
        const content = `# Notes from ${fileName}\n\n## Summary\nThis is a mock extraction from the uploaded PDF file.\n\n## Key Points\n- Point 1: Important concept from the document\n- Point 2: Critical information extracted\n- Point 3: Summary of main ideas\n\n## Detailed Notes\nThe document contains valuable information that has been processed and summarized for easy review.`;

        const [result] = await pool.execute(
            `INSERT INTO notes (user_id, title, content, source, file_name) VALUES (?, ?, ?, ?, ?)`,
            [null, `Notes from ${fileName}`, content, 'pdf', fileName]
        );

        const note = {
            id: result.insertId,
            title: `Notes from ${fileName}`,
            content,
            source: 'pdf',
            createdAt: new Date().toISOString()
        };

        res.json({ success: true, note });
    } catch (error) {
        console.error('Error uploading PDF:', error);
        res.status(500).json({ error: 'Failed to upload PDF' });
    }
});

// Upload local file
app.post('/upload-local-file', async (req, res) => {
    try {
        const { fileName, fileContent } = req.body;

        if (!fileName || !fileContent) {
            return res.status(400).json({ error: 'Missing file data' });
        }

        const content = `# ${fileName}\n\n${fileContent}\n\n---\n*Processed on ${new Date().toLocaleString()}*`;

        const [result] = await pool.execute(
            `INSERT INTO notes (user_id, title, content, source, file_name) VALUES (?, ?, ?, ?, ?)`,
            [null, `Notes from ${fileName}`, content, 'local_file', fileName]
        );

        const note = {
            id: result.insertId,
            title: `Notes from ${fileName}`,
            content,
            source: 'local_file',
            createdAt: new Date().toISOString()
        };

        res.json({ success: true, note });
    } catch (error) {
        console.error('Error uploading local file:', error);
        res.status(500).json({ error: 'Failed to upload local file' });
    }
});

// Generate AI notes from text input
app.post('/generate-ai-notes', async (req, res) => {
    try {
        const { topic, content } = req.body;

        if (!topic && !content) {
            return res.status(400).json({ error: 'Missing topic or content' });
        }

        const prompt = `Generate comprehensive study notes for the topic: "${topic}". Use the following content as a source, if provided: "${content || 'No specific content provided, use general knowledge.'}". 
        
        The notes should be formatted clearly using Markdown with sections for a Summary, Key Concepts (as a bulleted list), and Practice Questions (as a numbered list).`;

        // **GEMINI API CALL for Notes Generation**
        const model = genAI.getGenerativeModel({ model: MODEL });
        const aiResult = await model.generateContent(prompt);
        const response = await aiResult.response;
        const text = response.text();

        const noteContent = text + `\n\n---\n*Generated by AI on ${new Date().toLocaleString()}*`;

        const [result] = await pool.execute(
            `INSERT INTO notes (user_id, title, content, source) VALUES (?, ?, ?, ?)`,
            [null, topic || 'AI Generated Notes', noteContent, 'ai']
        );

        const note = {
            id: result.insertId,
            title: topic || 'AI Generated Notes',
            content: noteContent,
            source: 'ai',
            createdAt: new Date().toISOString()
        };

        res.json({ success: true, note });
    } catch (error) {
        console.error('Error generating AI notes:', error);
        res.status(500).json({ error: 'Failed to generate AI notes from AI. Check API key/model.' });
    }
});

// Get notes history
app.get('/notes-history', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, title, content, source, created_at as createdAt 
             FROM notes 
             ORDER BY created_at DESC`
        );

        res.json({ success: true, notes: rows });
    } catch (error) {
        console.error('Error fetching notes history:', error);
        res.status(500).json({ error: 'Failed to fetch notes history' });
    }
});

// Delete note
app.delete('/note/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await pool.execute(`DELETE FROM notes WHERE id = ?`, [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).json({ error: 'Failed to delete note' });
    }
});

// ==========================================
// FLASHCARDS ROUTES
// ==========================================

// Generate flashcards
app.post('/generate-flashcards', async (req, res) => {
    try {
        const { topic, count } = req.body;
        const cardCount = count || 5;

        // **GEMINI API CALL for Flashcards Generation**
        const prompt = `Generate a set of ${cardCount} flashcards for the topic: "${topic}".
        
        The output MUST be a JSON array of objects.
        Each object in the array MUST have the following structure:
        {
          "question": [string, The flashcard question],
          "answer": [string, The detailed answer to the question]
        }
        
        Do not include any other text, explanation, or markdown formatting outside of the JSON array.`;

        const model = genAI.getGenerativeModel({ 
            model: MODEL,
            generationConfig: { responseMimeType: "application/json" }
        });
        const aiResult = await model.generateContent(prompt);
        const response = await aiResult.response;
        const text = response.text();

        // The response text is a JSON string, so we parse it
        const generatedCards = JSON.parse(text);

        // Create flashcard set
        const [setResult] = await pool.execute(
            `INSERT INTO flashcard_sets (user_id, topic, total_count, known_count) VALUES (?, ?, ?, ?)`,
            [null, topic || 'General Study', generatedCards.length, 0]
        );

        const setId = setResult.insertId;
        const cards = [];

        // Insert each card into the database
        for (const card of generatedCards) {
            const [cardResult] = await pool.execute(
                `INSERT INTO flashcards (set_id, question, answer, known) VALUES (?, ?, ?, ?)`,
                [
                    setId,
                    card.question,
                    card.answer,
                    false
                ]
            );

            cards.push({
                id: cardResult.insertId,
                question: card.question,
                answer: card.answer,
                known: false
            });
        }

        const flashcardSet = {
            id: setId,
            topic: topic || 'General Study',
            cards,
            createdAt: new Date().toISOString(),
            knownCount: 0,
            totalCount: cards.length
        };

        res.json({ success: true, flashcardSet });
    } catch (error) {
        console.error('Error generating flashcards:', error);
        res.status(500).json({ error: 'Failed to generate flashcards from AI. Check API key/model.' });
    }
});

// Get flashcards history
app.get('/flashcards-history', async (req, res) => {
    try {
        const [sets] = await pool.execute(
            `SELECT id, topic, total_count as totalCount, known_count as knownCount, created_at as createdAt 
             FROM flashcard_sets 
             ORDER BY created_at DESC`
        );

        const flashcards = [];
        for (const set of sets) {
            const [cards] = await pool.execute(
                `SELECT id, question, answer, known FROM flashcards WHERE set_id = ?`,
                [set.id]
            );
            flashcards.push({
                ...set,
                cards
            });
        }

        res.json({ success: true, flashcards });
    } catch (error) {
        console.error('Error fetching flashcards:', error);
        res.status(500).json({ error: 'Failed to fetch flashcards' });
    }
});

// Save flashcard status
app.post('/save-flashcard-status', async (req, res) => {
    try {
        const { setId, cardId, known } = req.body;

        await pool.execute(
            `UPDATE flashcards SET known = ? WHERE id = ? AND set_id = ?`,
            [known, cardId, setId]
        );

        // Get updated flashcard set
        const [sets] = await pool.execute(
            `SELECT id, topic, total_count as totalCount, known_count as knownCount, created_at as createdAt 
             FROM flashcard_sets WHERE id = ?`,
            [setId]
        );

        if (sets.length > 0) {
            const [cards] = await pool.execute(
                `SELECT id, question, answer, known FROM flashcards WHERE set_id = ?`,
                [setId]
            );

            // Re-calculate knownCount and update the set table
            const newKnownCount = cards.filter(c => c.known).length;
            await pool.execute(
                `UPDATE flashcard_sets SET known_count = ? WHERE id = ?`,
                [newKnownCount, setId]
            );

            const flashcardSet = {
                ...sets[0],
                knownCount: newKnownCount, // Use the fresh count
                cards
            };

            res.json({ success: true, flashcardSet });
        } else {
            res.status(404).json({ error: 'Flashcard set not found' });
        }
    } catch (error) {
        console.error('Error saving flashcard status:', error);
        res.status(500).json({ error: 'Failed to save flashcard status' });
    }
});

// Delete flashcard set
app.delete('/flashcard/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await pool.execute(`DELETE FROM flashcard_sets WHERE id = ?`, [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting flashcard set:', error);
        res.status(500).json({ error: 'Failed to delete flashcard set' });
    }
});

// ==========================================
// CHAT ROUTES
// ==========================================

// Chat endpoint
app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Save user message
        await pool.execute(
            `INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)`,
            [null, 'user', message]
        );

        // Fetch past chat history for context
        const [historyRows] = await pool.execute(
            `SELECT role, content FROM chat_history ORDER BY created_at ASC`
        );

        const chatHistory = historyRows.map(row => ({
            role: row.role === 'user' ? 'user' : 'model', // Gemini expects 'model' for the assistant role
            parts: [{ text: row.content }]
        }));

        // **GEMINI API CALL for Chat**
        const model = genAI.getGenerativeModel({ model: MODEL });
        
        // Create a new chat session to maintain conversation history
        const chat = model.startChat({
            history: chatHistory,
        });

        const chatResult = await chat.sendMessage(message);
        const response = await chatResult.response;
        const aiContent = response.text();

        // Save AI response
        const [result] = await pool.execute(
            `INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)`,
            [null, 'assistant', aiContent] // Store as 'assistant' in DB for consistency
        );

        const aiResponse = {
            id: result.insertId,
            role: 'assistant',
            content: aiContent,
            timestamp: new Date().toISOString()
        };

        res.json({ success: true, response: aiResponse });
    } catch (error) {
        console.error('Error processing chat:', error);
        res.status(500).json({ error: 'Failed to process chat message from AI. Check API key/model.' });
    }
});

// Get chat history
app.get('/chat-history', async (req, res) => {
    try {
        // === FIX 2: CLEANED UP SQL QUERY TO AVOID ER_PARSE_ERROR ===
        const [rows] = await pool.execute(
            `SELECT id, role, content, created_at as timestamp 
FROM chat_history 
ORDER BY created_at ASC`
        );
        // ==========================================================

        res.json({ success: true, chatHistory: rows });
    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({ error: 'Failed to fetch chat history' });
    }
});

// Clear chat history
app.delete('/chat-history', async (req, res) => {
    try {
        await pool.execute(`DELETE FROM chat_history`);
        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing chat history:', error);
        res.status(500).json({ error: 'Failed to clear chat history' });
    }
});

// ==========================================
// DASHBOARD ROUTES
// ==========================================

// Get dashboard statistics
app.get('/dashboard-stats', async (req, res) => {
    try {
        const [notesCount] = await pool.execute(`SELECT COUNT(*) as count FROM notes`);
        const [plansCount] = await pool.execute(`SELECT COUNT(*) as count FROM study_plans`);
        const [flashcardsCount] = await pool.execute(`SELECT SUM(total_count) as count FROM flashcard_sets`);
        
        const [taskStats] = await pool.execute(
            `SELECT 
                SUM(JSON_LENGTH(plan_json)) as total,
                SUM(FLOOR((progress / 100) * JSON_LENGTH(plan_json))) as completed
             FROM study_plans 
             WHERE plan_json IS NOT NULL`
        );

        const dashboardStats = {
            totalNotes: notesCount[0].count,
            totalStudyPlans: plansCount[0].count,
            totalFlashcards: flashcardsCount[0].count || 0,
            totalTasks: taskStats[0].total || 0,
            completedTasks: taskStats[0].completed || 0
        };

        res.json({ success: true, stats: dashboardStats });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// ==========================================
// DOWNLOAD/EXPORT ROUTES
// ==========================================

// Download/Export data
app.post('/download-export', async (req, res) => {
    try {
        const { type, id, format } = req.body;

        let content = '';
        let filename = '';

        switch (type) {
            case 'study':
                const [plans] = await pool.execute(
                    `SELECT * FROM study_plans WHERE id = ?`,
                    [id]
                );
                if (plans.length > 0) {
                    const plan = {
                        ...plans[0],
                        plan: JSON.parse(plans[0].plan_json)
                    };
                    content = formatStudyPlanForExport(plan);
                    filename = `study-plan-${plan.course_name.replace(/\s+/g, '-')}-${Date.now()}.${format}`;
                }
                break;
            case 'notes':
                const [notes] = await pool.execute(
                    `SELECT * FROM notes WHERE id = ?`,
                    [id]
                );
                if (notes.length > 0) {
                    content = notes[0].content;
                    filename = `note-${notes[0].title.replace(/\s+/g, '-')}-${Date.now()}.${format}`;
                }
                break;
            case 'chat':
                const [chatRows] = await pool.execute(
                    `SELECT role, content, created_at as timestamp FROM chat_history ORDER BY created_at ASC`
                );
                content = formatChatHistoryForExport(chatRows);
                filename = `chat-history-${Date.now()}.${format}`;
                break;
            case 'flashcards':
                const [sets] = await pool.execute(
                    `SELECT * FROM flashcard_sets WHERE id = ?`,
                    [id]
                );
                if (sets.length > 0) {
                    const [cards] = await pool.execute(
                        `SELECT * FROM flashcards WHERE set_id = ?`,
                        [id]
                    );
                    const flashcardSet = {
                        ...sets[0],
                        cards
                    };
                    content = formatFlashcardsForExport(flashcardSet);
                    filename = `flashcards-${sets[0].topic.replace(/\s+/g, '-')}-${Date.now()}.${format}`;
                }
                break;
            default:
                return res.status(400).json({ error: 'Invalid export type' });
        }

        if (!content) {
            return res.status(404).json({ error: 'Content not found' });
        }

        res.json({ success: true, content, filename });
    } catch (error) {
        console.error('Error exporting data:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// Helper functions for formatting exports
function formatStudyPlanForExport(plan) {
    const header = `STUDY PLAN: ${plan.course_name}\n${'='.repeat(50)}\n\n`;
    const details = `Deadline: ${new Date(plan.deadline).toLocaleDateString()}\nHours per day: ${plan.hours_per_day}\nTotal hours: ${plan.total_hours}\nProgress: ${plan.progress}%\n\n`;
    const weeks = plan.plan.map(w => 
        `Week ${w.week}: ${w.topic}\nHours: ${w.hours}\nTasks:\n${w.tasks.map(t => `  - ${t}`).join('\n')}\n`
    ).join('\n');
    return header + details + weeks + `\nCreated: ${new Date(plan.created_at).toLocaleString()}\n`;
}

function formatChatHistoryForExport(history) {
    const header = `CHAT HISTORY\n${'='.repeat(50)}\n\n`;
    const messages = history.map(msg => 
        `[${new Date(msg.timestamp).toLocaleString()}] ${msg.role.toUpperCase()}:\n${msg.content}\n`
    ).join('\n');
    return header + messages;
}

function formatFlashcardsForExport(flashcardSet) {
    const header = `FLASHCARDS: ${flashcardSet.topic}\n${'='.repeat(50)}\n\nTotal Cards: ${flashcardSet.total_count}\nKnown: ${flashcardSet.known_count}\n\n`;
    const cards = flashcardSet.cards.map((card, i) => 
        `Card ${i + 1}:\nQ: ${card.question}\nA: ${card.answer}\nStatus: ${card.known ? 'Known' : 'Unknown'}\n`
    ).join('\n');
    return header + cards + `Created: ${new Date(flashcardSet.created_at).toLocaleString()}\n`;
}

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
    console.log(`✓ Frontend: http://localhost:${PORT}`);
    console.log(`✓ Database: ${process.env.DB_NAME || 'study_management'}`);
    console.log(`✓ Server running on port : http://localhost:${PORT}`);
});