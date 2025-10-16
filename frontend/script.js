// Theme Toggle
function initializeTheme() {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
}

document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
});

// API Configuration
// Use the backend URL from environment or default to localhost
const API_BASE_URL = 'https://ai-powered-study-management-system-with-g5ve.onrender.com'

// Set minimum date for date inputs
window.addEventListener('load', () => {
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(input => {
        if (!input.hasAttribute('min')) input.setAttribute('min', today);
    });
});

// Chat Page Functionality
function initializeChatPage() {
    const chatMessages = document.getElementById('chatMessages');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    
    // Only run if we're on the chat page
    if (!chatMessages || !chatForm || !chatInput) return;
    
    async function loadChatHistory() {
        try {
            const response = await fetch(`${API_BASE_URL}/chat-history`);
            const data = await response.json();
            
            if (data.success && data.chatHistory.length > 0) {
                // Clear welcome message
                chatMessages.innerHTML = '';
                
                // Display all messages
                data.chatHistory.forEach(msg => {
                    displayMessage(msg.content, msg.role, false);
                });
                
                scrollToBottom();
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }
    
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const message = chatInput.value.trim();
        if (!message) return;

        // Clear input
        chatInput.value = '';

        // Display user message immediately
        displayMessage(message, 'user', true);

        // Show typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'message assistant typing';
        typingIndicator.innerHTML = '<div class="message-content"><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span></div>';
        chatMessages.appendChild(typingIndicator);
        scrollToBottom();

        try {
            const response = await fetch(`${API_BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            const data = await response.json();
            
            // Remove typing indicator
            typingIndicator.remove();
            
            if (data.success) {
                displayMessage(data.response.content, 'assistant', true);
            } else {
                displayMessage('Sorry, I encountered an error. Please try again.', 'assistant', true);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            typingIndicator.remove();
            displayMessage('Sorry, I could not connect to the server. Please try again.', 'assistant', true);
        }
    });
    
    function displayMessage(content, role, animate = false) {
        // Remove welcome message if it exists
        const welcomeMsg = chatMessages.querySelector('.welcome-message');
        if (welcomeMsg) {
            welcomeMsg.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(timeDiv);
        
        if (animate) {
            messageDiv.style.opacity = '0';
            messageDiv.style.transform = 'translateY(10px)';
        }
        
        chatMessages.appendChild(messageDiv);
        
        if (animate) {
            setTimeout(() => {
                messageDiv.style.transition = 'all 0.3s ease';
                messageDiv.style.opacity = '1';
                messageDiv.style.transform = 'translateY(0)';
            }, 10);
        }
        
        scrollToBottom();
    }
    
    const scrollToBottom = () => chatMessages.scrollTop = chatMessages.scrollHeight;
    
    const exportChatFormat = document.getElementById('exportChatFormat');
    if (exportChatFormat) {
        exportChatFormat.addEventListener('change', async (e) => {
            const format = e.target.value;
            if (!format) return;
            
            try {
                const response = await fetch(`${API_BASE_URL}/download-export`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'chat', format: format })
                });

                const data = await response.json();
                
                if (data.success) {
                    const mimeType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                    const blob = new Blob([data.content], { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = data.filename;
                    a.click();
                    URL.revokeObjectURL(url);
                } else {
                    alert('No chat history to export');
                }
            } catch (error) {
                console.error('Error exporting chat:', error);
                alert('Failed to export chat history');
            }
            
            e.target.value = '';
        });
    }
    
    const clearChatBtn = document.getElementById('clearChatBtn');
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to clear all chat history?')) return;
            
            try {
                const response = await fetch(`${API_BASE_URL}/chat-history`, {
                    method: 'DELETE'
                });

                const data = await response.json();
                
                if (data.success) {
                    chatMessages.innerHTML = `
                        <div class="welcome-message">
                            <h2>👋 Hello! I'm your AI Study Assistant</h2>
                            <p>Ask me anything about your studies, and I'll help you learn better!</p>
                        </div>
                    `;
                }
            } catch (error) {
                console.error('Error clearing chat:', error);
                alert('Failed to clear chat history');
            }
        });
    }
    
    // Initialize chat page
    loadChatHistory();
    chatInput.focus();
}

document.addEventListener('DOMContentLoaded', initializeChatPage);

// Notes Page Functionality
function initializeNotesPage() {
    // Check if we're on the notes page
    const fileTab = document.getElementById('fileTab');
    if (!fileTab) return;
    
    // State variables for current note IDs
    let currentNoteId1 = null;
    let currentNoteId2 = null;
    let currentFlashcardSetId = null;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(tabName + 'Tab').classList.add('active');
        });
    });
    
    const fileUploadForm = document.getElementById('fileUploadForm');
    if (fileUploadForm) {
        fileUploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const fileInput = document.getElementById('uploadFile');
            const file = fileInput.files[0];
            
            if (!file) {
                alert('Please select a file');
                return;
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const response = await fetch(`${API_BASE_URL}/upload-local-file`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            fileName: file.name,
                            fileContent: e.target.result
                        })
                    });

                    const data = await response.json();
                    
                    if (data.success) {
                        currentNoteId1 = data.note.id;
                        displayNotes(data.note, 1);
                        loadNotesHistory(1);
                        fileInput.value = '';
                    }
                } catch (error) {
                    console.error('Error uploading file:', error);
                    alert('Failed to upload file');
                }
            };
            reader.readAsText(file);
        });
    }
    
    const aiNotesForm = document.getElementById('aiNotesForm');
    if (aiNotesForm) {
        aiNotesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const topic = document.getElementById('noteTopic').value;
            const content = document.getElementById('noteContent').value;

            try {
                const response = await fetch(`${API_BASE_URL}/generate-ai-notes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ topic, content })
                });

                const data = await response.json();
                
                if (data.success) {
                    currentNoteId2 = data.note.id;
                    displayNotes(data.note, 2);
                    loadNotesHistory(2);
                    aiNotesForm.reset();
                }
            } catch (error) {
                console.error('Error generating notes:', error);
                alert('Failed to generate notes');
            }
        });
    }
    
    function displayNotes(note, tab) {
        const notesSection = document.getElementById('generatedNotesSection' + tab);
        const notesContent = document.getElementById('notesContent' + tab);
        
        notesContent.innerHTML = note.content.replace(/\n/g, '<br>');
        notesContent.contentEditable = 'false';
        
        document.getElementById('editNotesBtn' + tab).style.display = 'inline-block';
        document.getElementById('saveNotesBtn' + tab).style.display = 'none';
        
        notesSection.style.display = 'block';
        notesSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    [1, 2].forEach(tab => {
        const editBtn = document.getElementById(`editNotesBtn${tab}`);
        const saveBtn = document.getElementById(`saveNotesBtn${tab}`);
        
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                const content = document.getElementById(`notesContent${tab}`);
                content.contentEditable = 'true';
                content.focus();
                editBtn.style.display = 'none';
                saveBtn.style.display = 'inline-block';
            });
        }
        
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const content = document.getElementById(`notesContent${tab}`);
                content.contentEditable = 'false';
                editBtn.style.display = 'inline-block';
                saveBtn.style.display = 'none';
                alert('Notes saved successfully!');
            });
        }
    });
    
    [1, 2].forEach(tab => {
        const downloadFormat = document.getElementById(`downloadFormat${tab}`);
        if (downloadFormat) {
            downloadFormat.addEventListener('change', async (e) => {
                const format = e.target.value;
                const noteId = tab === 1 ? currentNoteId1 : currentNoteId2;
                if (!format || !noteId) return;
                
                await downloadNote(noteId, format);
                e.target.value = '';
            });
        }
    });
    
    async function loadNotesHistory(tab) {
        try {
            const response = await fetch(`${API_BASE_URL}/notes-history`);
            const data = await response.json();
            
            const historyDiv = document.getElementById('notesHistory' + tab);
            
            if (data.success && data.notes.length > 0) {
                historyDiv.innerHTML = data.notes.map(note => `
                    <div class="history-item" data-id="${note.id}">
                        <div class="history-header">
                            <h3>${note.title}</h3>
                            <span class="date">${new Date(note.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div class="history-details">
                            <p>Source: ${note.source}</p>
                        </div>
                        <div class="history-actions">
                            <button onclick="viewNote(${note.id}, ${tab})" class="btn btn-small">View</button>
                            <button onclick="downloadNotePrompt(${note.id})" class="btn btn-small">Export</button>
                            <button onclick="deleteNote(${note.id}, ${tab})" class="btn btn-small btn-danger">Delete</button>
                        </div>
                    </div>
                `).join('');
            } else {
                const msg = tab === 1 ? 'No notes yet. Upload a file to generate notes!' : 'No notes yet. Generate your first notes above!';
                historyDiv.innerHTML = `<p class="empty-state">${msg}</p>`;
            }
        } catch (error) {
            console.error('Error loading notes history:', error);
        }
    }
    
    window.viewNote = async function(id, tab) {
        try {
            const response = await fetch(`${API_BASE_URL}/notes-history`);
            const data = await response.json();
            
            if (data.success) {
                const note = data.notes.find(n => n.id === id);
                if (note) {
                    if (tab === 1) currentNoteId1 = id;
                    else currentNoteId2 = id;
                    displayNotes(note, tab);
                }
            }
        } catch (error) {
            console.error('Error viewing note:', error);
        }
    };
    
    async function downloadNote(id, format) {
        try {
            const response = await fetch(`${API_BASE_URL}/download-export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'notes', id: id, format: format })
            });

            const data = await response.json();
            
            if (data.success) {
                const mimeType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                const blob = new Blob([data.content], { type: mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = data.filename;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Error downloading note:', error);
        }
    }
    
    window.downloadNotePrompt = async function(id) {
        const format = prompt('Enter format (pdf or docx):', 'pdf');
        if (format && (format === 'pdf' || format === 'docx')) {
            await downloadNote(id, format);
        }
    };
    
    window.deleteNote = async function(id, tab) {
        if (!confirm('Are you sure you want to delete this note?')) return;
        
        try {
            const response = await fetch(`${API_BASE_URL}/note/${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            
            if (data.success) {
                loadNotesHistory(tab);
                if ((tab === 1 && currentNoteId1 === id) || (tab === 2 && currentNoteId2 === id)) {
                    document.getElementById('generatedNotesSection' + tab).style.display = 'none';
                    if (tab === 1) currentNoteId1 = null;
                    else currentNoteId2 = null;
                }
            }
        } catch (error) {
            console.error('Error deleting note:', error);
        }
    };
    
    const flashcardsForm = document.getElementById('flashcardsForm');
    if (flashcardsForm) {
        flashcardsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const topic = document.getElementById('flashcardTopic').value;
            const count = parseInt(document.getElementById('flashcardCount').value);

            try {
                const response = await fetch(`${API_BASE_URL}/generate-flashcards`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ topic, count })
                });

                const data = await response.json();
                
                if (data.success) {
                    currentFlashcardSetId = data.flashcardSet.id;
                    displayFlashcards(data.flashcardSet);
                    loadFlashcardsHistory();
                    flashcardsForm.reset();
                }
            } catch (error) {
                console.error('Error generating flashcards:', error);
                alert('Failed to generate flashcards');
            }
        });
    }
    
    function displayFlashcards(flashcardSet) {
        const flashcardsSection = document.getElementById('flashcardsSection');
        const container = document.getElementById('flashcardsContainer');
        
        container.innerHTML = flashcardSet.cards.map(card => `
            <div class="flashcard" data-card-id="${card.id}">
                <div class="flashcard-inner">
                    <div class="flashcard-front">
                        <h3>Question</h3>
                        <p>${card.question}</p>
                        <button class="btn btn-small flip-btn" onclick="flipCard(${card.id})">Show Answer</button>
                    </div>
                    <div class="flashcard-back">
                        <h3>Answer</h3>
                        <p>${card.answer}</p>
                        <div class="flashcard-actions">
                            <button class="btn btn-small ${card.known ? 'btn-success' : ''}" onclick="markKnown(${flashcardSet.id}, ${card.id}, true)">
                                ${card.known ? '✓ Known' : 'Mark Known'}
                            </button>
                            <button class="btn btn-small ${!card.known ? 'btn-danger' : ''}" onclick="markKnown(${flashcardSet.id}, ${card.id}, false)">
                                ${!card.known ? '✗ Unknown' : 'Mark Unknown'}
                            </button>
                        </div>
                        <button class="btn btn-small flip-btn" onclick="flipCard(${card.id})">Show Question</button>
                    </div>
                </div>
            </div>
        `).join('');
        
        updateFlashcardProgress(flashcardSet);
        flashcardsSection.style.display = 'block';
        flashcardsSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    window.flipCard = function(cardId) {
        const card = document.querySelector(`[data-card-id="${cardId}"]`);
        card.classList.toggle('flipped');
    };
    
    window.markKnown = async function(setId, cardId, known) {
        try {
            const response = await fetch(`${API_BASE_URL}/save-flashcard-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ setId, cardId, known })
            });

            const data = await response.json();
            
            if (data.success) {
                displayFlashcards(data.flashcardSet);
            }
        } catch (error) {
            console.error('Error saving flashcard status:', error);
        }
    };
    
    function updateFlashcardProgress(flashcardSet) {
        const progress = document.getElementById('flashcardProgress');
        if (progress) {
            progress.textContent = `${flashcardSet.knownCount} / ${flashcardSet.totalCount} Known`;
        }
    }
    
    const downloadFlashcardsFormat = document.getElementById('downloadFlashcardsFormat');
    if (downloadFlashcardsFormat) {
        downloadFlashcardsFormat.addEventListener('change', async (e) => {
            const format = e.target.value;
            if (!format || !currentFlashcardSetId) return;
            
            await downloadFlashcardSet(currentFlashcardSetId, format);
            e.target.value = '';
        });
    }
    
    async function loadFlashcardsHistory() {
        try {
            const response = await fetch(`${API_BASE_URL}/flashcards-history`);
            const data = await response.json();
            
            const historyDiv = document.getElementById('flashcardsHistory');
            
            if (data.success && data.flashcards.length > 0) {
                historyDiv.innerHTML = data.flashcards.map(set => `
                    <div class="history-item" data-id="${set.id}">
                        <div class="history-header">
                            <h3>${set.topic}</h3>
                            <span class="date">${new Date(set.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div class="history-details">
                            <p>Cards: ${set.totalCount}</p>
                            <p>Known: ${set.knownCount} (${Math.round((set.knownCount / set.totalCount) * 100)}%)</p>
                        </div>
                        <div class="history-actions">
                            <button onclick="viewFlashcards(${set.id})" class="btn btn-small">View</button>
                            <button onclick="downloadFlashcardSet(${set.id})" class="btn btn-small">Export</button>
                            <button onclick="deleteFlashcardSet(${set.id})" class="btn btn-small btn-danger">Delete</button>
                        </div>
                    </div>
                `).join('');
            } else {
                historyDiv.innerHTML = '<p class="empty-state">No flashcards yet. Generate your first set above!</p>';
            }
        } catch (error) {
            console.error('Error loading flashcards history:', error);
        }
    }
    
    window.viewFlashcards = async function(id) {
        try {
            const response = await fetch(`${API_BASE_URL}/flashcards-history`);
            const data = await response.json();
            
            if (data.success) {
                const flashcardSet = data.flashcards.find(f => f.id === id);
                if (flashcardSet) {
                    currentFlashcardSetId = id;
                    displayFlashcards(flashcardSet);
                }
            }
        } catch (error) {
            console.error('Error viewing flashcards:', error);
        }
    };
    
    window.downloadFlashcardSet = async function(id, format) {
        if (!format) {
            format = prompt('Enter format (pdf or docx):', 'pdf');
            if (!format || (format !== 'pdf' && format !== 'docx')) return;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/download-export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'flashcards', id: id, format: format })
            });

            const data = await response.json();
            
            if (data.success) {
                const mimeType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                const blob = new Blob([data.content], { type: mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = data.filename;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Error downloading flashcard set:', error);
        }
    };
    
    window.deleteFlashcardSet = async function(id) {
        if (!confirm('Are you sure you want to delete this flashcard set?')) return;
        
        try {
            const response = await fetch(`${API_BASE_URL}/flashcard/${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            
            if (data.success) {
                loadFlashcardsHistory();
                if (currentFlashcardSetId === id) {
                    document.getElementById('flashcardsSection').style.display = 'none';
                    currentFlashcardSetId = null;
                }
            }
        } catch (error) {
            console.error('Error deleting flashcard set:', error);
        }
    };
    
    // Initialize notes page
    loadNotesHistory(1);
    loadNotesHistory(2);
    loadFlashcardsHistory();
}

document.addEventListener('DOMContentLoaded', initializeNotesPage);

// Study Page Functionality
function initializeStudyPage() {
    // Check if we're on the study page
    const studyPlanForm = document.getElementById('studyPlanForm');
    if (!studyPlanForm) return;
    
    // State variable for current plan ID
    let currentPlanId = null;
    
    async function loadDashboardStats() {
        try {
            const response = await fetch(`${API_BASE_URL}/dashboard-stats`);
            const data = await response.json();
            
            if (data.success) {
                document.getElementById('totalNotes').textContent = data.stats.totalNotes;
                document.getElementById('totalPlans').textContent = data.stats.totalStudyPlans;
                document.getElementById('totalFlashcards').textContent = data.stats.totalFlashcards;
                
                const progress = data.stats.totalTasks > 0 
                    ? Math.round((data.stats.completedTasks / data.stats.totalTasks) * 100) 
                    : 0;
                document.getElementById('progressStat').textContent = progress + '%';
            }
        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        }
    }
    
    async function loadStudyHistory() {
        try {
            const response = await fetch(`${API_BASE_URL}/studyplans`);
            const data = await response.json();
            
            const historyDiv = document.getElementById('studyHistory');
            
            if (data.success && data.studyPlans.length > 0) {
                historyDiv.innerHTML = data.studyPlans.map(plan => `
                    <div class="history-item" data-id="${plan.id}">
                        <div class="history-header">
                            <h3>${plan.courseName}</h3>
                            <span class="date">${new Date(plan.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div class="history-details">
                            <p>Deadline: ${new Date(plan.deadline).toLocaleDateString()}</p>
                            <p>Hours/Day: ${plan.hoursPerDay}</p>
                            <p>Progress: ${plan.progress}%</p>
                        </div>
                        <div class="history-actions">
                            <button onclick="viewPlan(${plan.id})" class="btn btn-small">View</button>
                            <button onclick="downloadPlan(${plan.id})" class="btn btn-small">Export</button>
                            <button onclick="deletePlan(${plan.id})" class="btn btn-small btn-danger">Delete</button>
                        </div>
                    </div>
                `).join('');
            } else {
                historyDiv.innerHTML = '<p class="empty-state">No study plans yet. Create your first plan above!</p>';
            }
        } catch (error) {
            console.error('Error loading study history:', error);
        }
    }
    
    studyPlanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            courseName: document.getElementById('courseName').value,
            deadline: document.getElementById('deadline').value,
            hoursPerDay: parseInt(document.getElementById('hoursPerDay').value)
        };

        try {
            const response = await fetch(`${API_BASE_URL}/generate-study-plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await response.json();
            
            if (data.success) {
                currentPlanId = data.studyPlan.id;
                displayPlan(data.studyPlan);
                loadStudyHistory();
                loadDashboardStats();
                studyPlanForm.reset();
            } else {
                alert('Error generating study plan: ' + data.error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to generate study plan');
        }
    });
    
    function displayPlan(plan) {
        const planSection = document.getElementById('generatedPlanSection');
        const planContent = document.getElementById('planContent');
        
        let html = `
            <div class="plan-header">
                <h3>${plan.courseName}</h3>
                <p>Deadline: ${new Date(plan.deadline).toLocaleDateString()}</p>
                <p>Total Hours: ${plan.totalHours} (${plan.hoursPerDay} hours/day for ${plan.daysUntil} days)</p>
            </div>
            <div class="plan-weeks">
        `;
        
        plan.plan.forEach(week => {
            html += `
                <div class="week-card">
                    <h4>Week ${week.week}: ${week.topic}</h4>
                    <p class="hours">Allocated Hours: ${week.hours}</p>
                    <ul class="task-list">
                        ${week.tasks.map(task => `<li>${task}</li>`).join('')}
                    </ul>
                </div>
            `;
        });
        
        html += '</div>';
        planContent.innerHTML = html;
        
        document.getElementById('planProgress').value = plan.progress;
        document.getElementById('progressValue').textContent = plan.progress + '%';
        
        planSection.style.display = 'block';
        planSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    window.viewPlan = async function(id) {
        try {
            const response = await fetch(`${API_BASE_URL}/studyplans`);
            const data = await response.json();
            
            if (data.success) {
                const plan = data.studyPlans.find(p => p.id === id);
                if (plan) {
                    currentPlanId = id;
                    displayPlan(plan);
                }
            }
        } catch (error) {
            console.error('Error viewing plan:', error);
        }
    };
    
    const saveProgressBtn = document.getElementById('saveProgressBtn');
    if (saveProgressBtn) {
        saveProgressBtn.addEventListener('click', async () => {
            if (!currentPlanId) return;
            
            const progress = parseInt(document.getElementById('planProgress').value);
            
            try {
                const response = await fetch(`${API_BASE_URL}/update-study-progress`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: currentPlanId,
                        progress: progress,
                        completed: progress === 100
                    })
                });

                const data = await response.json();
                
                if (data.success) {
                    alert('Progress saved successfully!');
                    loadStudyHistory();
                    loadDashboardStats();
                }
            } catch (error) {
                console.error('Error saving progress:', error);
            }
        });
    }
    
    const planProgress = document.getElementById('planProgress');
    if (planProgress) {
        planProgress.addEventListener('input', (e) => {
            document.getElementById('progressValue').textContent = e.target.value + '%';
        });
    }
    
    window.downloadPlan = async function(id, format) {
        if (!format) {
            format = prompt('Enter format (pdf or docx):', 'pdf');
            if (!format || (format !== 'pdf' && format !== 'docx')) return;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/download-export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'study', id: id, format: format })
            });

            const data = await response.json();
            
            if (data.success) {
                const mimeType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                const blob = new Blob([data.content], { type: mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = data.filename;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Error downloading plan:', error);
        }
    };
    
    const downloadPlanFormat = document.getElementById('downloadPlanFormat');
    if (downloadPlanFormat) {
        downloadPlanFormat.addEventListener('change', async (e) => {
            const format = e.target.value;
            if (!format || !currentPlanId) return;
            
            await downloadPlan(currentPlanId, format);
            e.target.value = '';
        });
    }
    
    window.deletePlan = async function(id) {
        if (!confirm('Are you sure you want to delete this study plan?')) return;
        
        try {
            const response = await fetch(`${API_BASE_URL}/studyplan/${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            
            if (data.success) {
                loadStudyHistory();
                loadDashboardStats();
                if (currentPlanId === id) {
                    document.getElementById('generatedPlanSection').style.display = 'none';
                    currentPlanId = null;
                }
            }
        } catch (error) {
            console.error('Error deleting plan:', error);
        }
    };
    
    // Initialize study page
    loadDashboardStats();
    loadStudyHistory();
}

document.addEventListener('DOMContentLoaded', initializeStudyPage);
