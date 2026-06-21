import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  MessageSquare,
  FileText,
  BookOpen,
  HelpCircle,
  Layout,
  Plus,
  Trash2,
  Upload,
  Moon,
  Sun,
  LogOut,
  Send,
  RotateCcw,
} from 'lucide-react';
import api from './api';
import { auth, provider, signInWithPopup, signOut, onAuthStateChanged, User } from './firebase';

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

interface Conversation {
  id: string;
  user_email: string;
  title: string;
  created_at?: Date;
}

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState<'chat' | 'flashcards' | 'quiz' | 'summary'>('chat');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const [filesUploading, setFilesUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [quiz, setQuiz] = useState<any[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<string[]>([]);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [summary, setSummary] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        loadConversations(currentUser.email!);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setConversations([]);
    setCurrentConversationId(null);
    setMessages([]);
  };

  const loadConversations = async (email: string) => {
    try {
      const res = await api.get(`/conversations/${email}`);
      setConversations(res.data);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const createConversation = async () => {
    if (!user) return;
    try {
      const res = await api.post('/conversations', { title: 'New Conversation' });
      setConversations([res.data, ...conversations]);
      setCurrentConversationId(res.data.id);
      setMessages([]);
      setFiles([]);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const selectConversation = async (conv: Conversation) => {
    setCurrentConversationId(conv.id);
    setActiveModule('chat');
    try {
      const [msgRes, fileRes] = await Promise.all([
        api.get(`/conversations/${user?.email}/${conv.id}/messages`),
        api.get(`/files/${user?.email}/${conv.id}`),
      ]);
      setMessages(msgRes.data);
      setFiles(fileRes.data);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const deleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await api.delete(`/conversations/${user.email}/${convId}`);
      setConversations(conversations.filter((c) => c.id !== convId));
      if (currentConversationId === convId) {
        setCurrentConversationId(null);
        setMessages([]);
        setFiles([]);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !user) return;
    const userMsg: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const res = await api.post('/chat', {
        email: user.email,
        conversation_id: currentConversationId,
        message: input,
      });
      if (!currentConversationId) {
        setCurrentConversationId(res.data.conversation_id);
        await loadConversations(user.email!);
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.message }]);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsTyping(false);
    }
  };

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !currentConversationId || !e.target.files) return;
    const file = e.target.files[0];
    setFilesUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      await api.post(`/upload?email=${user.email}&conversation_id=${currentConversationId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const fileRes = await api.get(`/files/${user.email}/${currentConversationId}`);
      setFiles(fileRes.data);
    } catch (error) {
      console.error('Failed to upload file:', error);
    } finally {
      setFilesUploading(false);
    }
  };

  const loadStudyTool = async (tool: string) => {
    if (!user || !currentConversationId) return;
    setActiveModule(tool as any);
    try {
      const res = await api.post('/study', {
        email: user.email,
        conversation_id: currentConversationId,
        tool: tool,
      });
      if (tool === 'flashcards') {
        setFlashcards(res.data);
        setCurrentCardIndex(0);
        setIsCardFlipped(false);
      } else if (tool === 'quiz') {
        setQuiz(res.data);
        setCurrentQuizIndex(0);
        setQuizAnswers([]);
        setQuizScore(null);
      } else if (tool === 'summary') {
        setSummary(res.data.summary);
      }
    } catch (error) {
      console.error('Failed to load study tool:', error);
    }
  };

  const handleQuizAnswer = (answer: string) => {
    const newAnswers = [...quizAnswers];
    newAnswers[currentQuizIndex] = answer;
    setQuizAnswers(newAnswers);
  };

  const submitQuiz = () => {
    let score = 0;
    quiz.forEach((q, i) => {
      if (quizAnswers[i] === q.correct_answer) score++;
    });
    setQuizScore(score);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md">
          <BookOpen className="w-16 h-16 text-blue-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Welcome to DocSage</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-6">Your AI-powered study assistant</p>
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-medium"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen flex', darkMode ? 'dark' : '')}>
      <div className="flex-1 flex bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-8 h-8 text-blue-600" />
              <h1 className="text-xl font-bold">DocSage</h1>
            </div>
            <button
              onClick={createConversation}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          </div>

          <nav className="p-2 space-y-1">
            <button
              onClick={() => setActiveModule('chat')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                activeModule === 'chat' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
            >
              <MessageSquare className="w-5 h-5" />
              Chat
            </button>
            <button
              onClick={() => currentConversationId && loadStudyTool('flashcards')}
              disabled={!currentConversationId}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                activeModule === 'flashcards' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700',
                !currentConversationId && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Layout className="w-5 h-5" />
              Flashcards
            </button>
            <button
              onClick={() => currentConversationId && loadStudyTool('quiz')}
              disabled={!currentConversationId}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                activeModule === 'quiz' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700',
                !currentConversationId && 'opacity-50 cursor-not-allowed'
              )}
            >
              <HelpCircle className="w-5 h-5" />
              Quiz
            </button>
            <button
              onClick={() => currentConversationId && loadStudyTool('summary')}
              disabled={!currentConversationId}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                activeModule === 'summary' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700',
                !currentConversationId && 'opacity-50 cursor-not-allowed'
              )}
            >
              <FileText className="w-5 h-5" />
              Summary
            </button>
          </nav>

          <div className="p-2 border-t border-gray-200 dark:border-gray-700 mt-auto">
            <p className="text-xs text-gray-500 dark:text-gray-400 px-3 mb-2 uppercase tracking-wider">
              Recent Chats
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => selectConversation(conv)}
                  className={cn(
                    'group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors',
                    currentConversationId === conv.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  )}
                >
                  <span className="truncate text-sm">{conv.title}</span>
                  <button
                    onClick={(e) => deleteConversation(e, conv.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                  >
                    <Trash2 className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 font-bold text-sm">
                  {user.displayName?.charAt(0) || user.email?.charAt(0).toUpperCase()}
                </div>
                <div className="text-sm">
                  <p className="font-medium truncate max-w-32">{user.displayName || user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col">
          {activeModule === 'chat' && (
            <div className="flex-1 flex flex-col">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between">
                <h2 className="font-semibold text-lg">
                  {currentConversationId ? 'Conversation' : 'Start a new conversation'}
                </h2>
                {currentConversationId && (
                  <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    <Upload className="w-4 h-4" />
                    <span className="text-sm">{filesUploading ? 'Uploading...' : 'Upload File'}</span>
                    <input type="file" className="hidden" onChange={uploadFile} />
                  </label>
                )}
              </div>

              {files.length > 0 && (
                <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/30">
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">Attached Files:</p>
                  <div className="flex flex-wrap gap-2">
                    {files.map((file, idx) => (
                      <span key={idx} className="px-3 py-1 bg-white dark:bg-gray-800 rounded-full text-sm border border-gray-200 dark:border-gray-700">
                        {file.filename}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && !isTyping && (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <BookOpen className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-500 dark:text-gray-400">Start by uploading files or asking a question</p>
                    </div>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex gap-3 max-w-3xl mx-auto',
                      msg.role === 'user' ? 'flex-row-reverse' : ''
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                        msg.role === 'user' ? 'bg-blue-100 dark:bg-blue-900 text-blue-600' : 'bg-gray-200 dark:bg-gray-700 text-gray-600'
                      )}
                    >
                      {msg.role === 'user' ? (
                        <span className="text-sm font-bold">{user.displayName?.charAt(0) || user.email?.charAt(0).toUpperCase()}</span>
                      ) : (
                        <BookOpen className="w-4 h-4" />
                      )}
                    </div>
                    <div
                      className={cn(
                        'px-4 py-3 rounded-2xl',
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-tr-sm'
                          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-tl-sm'
                      )}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex gap-3 max-w-3xl mx-auto">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-gray-600" />
                    </div>
                    <div className="px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-tl-sm">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="max-w-3xl mx-auto flex gap-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type your message..."
                    className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl border-0 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || isTyping}
                    className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeModule === 'flashcards' && flashcards.length > 0 && (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="w-full max-w-2xl">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold">Flashcards</h2>
                  <span className="text-gray-500 dark:text-gray-400">
                    {currentCardIndex + 1} of {flashcards.length}
                  </span>
                </div>

                <div
                  onClick={() => setIsCardFlipped(!isCardFlipped)}
                  className="relative h-80 cursor-pointer perspective-1000"
                >
                  <div
                    className={cn(
                      'absolute w-full h-full transition-transform duration-500 transform-style-preserve-3d',
                      isCardFlipped ? 'rotate-y-180' : ''
                    )}
                  >
                    <div className="absolute w-full h-full backface-hidden bg-white dark:bg-gray-800 rounded-2xl shadow-xl flex items-center justify-center p-8 border border-gray-200 dark:border-gray-700">
                      <p className="text-2xl font-medium text-center">{flashcards[currentCardIndex].question}</p>
                    </div>
                    <div className="absolute w-full h-full backface-hidden bg-blue-50 dark:bg-blue-900/20 rounded-2xl shadow-xl flex items-center justify-center p-8 border border-blue-200 dark:border-blue-900/30 rotate-y-180">
                      <p className="text-xl text-center text-gray-700 dark:text-gray-300">{flashcards[currentCardIndex].answer}</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center gap-4 mt-8">
                  <button
                    onClick={() => {
                      setCurrentCardIndex(Math.max(0, currentCardIndex - 1));
                      setIsCardFlipped(false);
                    }}
                    disabled={currentCardIndex === 0}
                    className="px-6 py-3 bg-gray-200 dark:bg-gray-700 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setIsCardFlipped(!isCardFlipped)}
                    className="px-6 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    {isCardFlipped ? 'Show Question' : 'Show Answer'}
                  </button>
                  <button
                    onClick={() => {
                      setCurrentCardIndex(Math.min(flashcards.length - 1, currentCardIndex + 1));
                      setIsCardFlipped(false);
                    }}
                    disabled={currentCardIndex === flashcards.length - 1}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeModule === 'quiz' && quiz.length > 0 && (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="w-full max-w-2xl">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold">Quiz</h2>
                  <span className="text-gray-500 dark:text-gray-400">
                    {currentQuizIndex + 1} of {quiz.length}
                  </span>
                </div>

                {quizScore === null ? (
                  <>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700 mb-8">
                      <p className="text-xl font-medium mb-6">{quiz[currentQuizIndex].question}</p>
                      <div className="space-y-3">
                        {quiz[currentQuizIndex].options.map((option: string, idx: number) => {
                          const letter = ['A', 'B', 'C', 'D'][idx];
                          return (
                            <button
                              key={idx}
                              onClick={() => handleQuizAnswer(letter)}
                              className={cn(
                                'w-full text-left px-4 py-3 rounded-xl border-2 transition-colors',
                                quizAnswers[currentQuizIndex] === letter
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                              )}
                            >
                              <span className="font-bold mr-3">{letter}.</span>
                              {option.slice(3)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-center gap-4">
                      <button
                        onClick={() => setCurrentQuizIndex(Math.max(0, currentQuizIndex - 1))}
                        disabled={currentQuizIndex === 0}
                        className="px-6 py-3 bg-gray-200 dark:bg-gray-700 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Previous
                      </button>
                      {currentQuizIndex === quiz.length - 1 ? (
                        <button
                          onClick={submitQuiz}
                          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors"
                        >
                          Submit Quiz
                        </button>
                      ) : (
                        <button
                          onClick={() => setCurrentQuizIndex(currentQuizIndex + 1)}
                          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors"
                        >
                          Next
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <div className="text-6xl mb-4">
                      {quizScore === quiz.length ? '🎉' : '📚'}
                    </div>
                    <h3 className="text-2xl font-bold mb-2">Quiz Complete!</h3>
                    <p className="text-4xl font-bold text-blue-600 mb-8">
                      {quizScore} / {quiz.length}
                    </p>
                    <button
                      onClick={() => {
                        setQuizScore(null);
                        setCurrentQuizIndex(0);
                        setQuizAnswers([]);
                      }}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors flex items-center gap-2 mx-auto"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeModule === 'summary' && summary && (
            <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-3xl mx-auto">
                <h2 className="text-2xl font-bold mb-6">Summary</h2>
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">
                  <div className="prose dark:prose-invert max-w-none">
                    <p className="text-lg leading-relaxed whitespace-pre-wrap">{summary}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
