import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Trash2, MessageSquare, BookOpen, FileQuestion, User, Loader2,
  FileText, Plus, List, PenLine, Lightbulb, Paperclip, UploadCloud, CheckCircle2, AlertCircle, Sparkles, Brain, X, LogOut,
  PanelLeftClose, PanelLeft, PanelRightClose, PanelRight
} from 'lucide-react';
import api from './api';
import { supabase } from './supabaseClient';
import type { Session } from '@supabase/supabase-js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message { role: 'user' | 'assistant'; content: string; }
interface Conversation { id: number; title: string; created_at: string; updated_at: string; }
interface FileRecord { filename: string; chunks: number; uploaded_at: string; }
interface Toast { type: 'success' | 'error' | 'info'; message: string; }
interface Flashcard { question: string; answer: string; }
interface QuizQuestion { question: string; options: string[]; correct_answer: string; }
interface StudyContent { content: string | Flashcard[] | QuizQuestion[]; format: string; }

const ACCEPTED_TYPES = '.pdf,.docx,.txt,.jpg,.jpeg,.png';
const ACCEPTED_LABEL = 'PDF, DOCX, TXT, JPG, PNG';

const NAV_ITEMS = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, desc: 'Ask questions about your documents' },
  { id: 'flashcards', label: 'Flashcards', icon: BookOpen, desc: 'Flip through Q&A study cards' },
  { id: 'quiz', label: 'Quiz', icon: FileQuestion, desc: 'Interactive multiple choice' },
  { id: 'summary', label: 'Summary', icon: FileText, desc: 'Full document summary' },
  { id: 'key_points', label: 'Key Points', icon: List, desc: 'Important bullet points' },
  { id: 'practice', label: 'Practice', icon: PenLine, desc: 'Type answers and get graded' },
  { id: 'explain', label: 'Explain Simply', icon: Lightbulb, desc: 'Beginner-friendly explanation' },
] as const;

type StudyToolId = typeof NAV_ITEMS[number]['id'];
type ActiveView = typeof NAV_ITEMS[number]['id'];

function FormattedMessage({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-2 leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;
        const html = trimmed
          .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
          .replace(/^\* (.+)$/, '• $1')
          .replace(/^\d+\.\s+/, (m) => m);
        if (trimmed.startsWith('### ')) return <h4 key={i} className="font-bold text-base mt-3">{trimmed.slice(4)}</h4>;
        if (trimmed.startsWith('## ')) return <h3 key={i} className="font-bold text-lg mt-3">{trimmed.slice(3)}</h3>;
        if (trimmed.startsWith('# ')) return <h2 key={i} className="font-bold text-xl mt-3">{trimmed.slice(2)}</h2>;
        if (trimmed.startsWith('---')) return <hr key={i} className="border-gray-700 my-2" />;
        return (
          <p
            key={i}
            className="opacity-95"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </div>
  );
}

function ToastBanner({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const styles = {
    success: 'border-green-500/50 bg-green-500/10 text-green-300',
    error: 'border-red-500/50 bg-red-500/10 text-red-300',
    info: 'border-purple-500/50 bg-purple-500/10 text-purple-300',
  };
  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Sparkles;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
      <div className={cn('flex items-start gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-sm', styles[toast.type])}>
        <Icon size={18} className="shrink-0 mt-0.5" />
        <p className="text-sm flex-1">{toast.message}</p>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function DocumentsBar({ files, totalChunks, isUploading, onAdd, onRemove }: {
  files: FileRecord[]; totalChunks: number; isUploading: boolean;
  onAdd: () => void; onRemove: (filename: string) => void;
}) {
  return (
    <div className="px-6 pb-3 flex items-center gap-3 min-w-0">
      <div className="flex-1 flex items-center gap-2 overflow-x-auto min-w-0 py-1">
        {files.map((f, i) => (
          <span key={`${f.filename}-${i}`}
            className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-[#1a1a1a] border border-gray-700 text-xs shrink-0 max-w-[220px] group">
            <FileText size={12} className="text-gray-400 shrink-0" />
            <span className="truncate" title={f.filename}>{f.filename}</span>
            <button type="button" onClick={() => onRemove(f.filename)} disabled={isUploading}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-500/10 shrink-0 disabled:opacity-40"
              title="Remove file">
              <Trash2 size={12} />
            </button>
          </span>
        ))}
      </div>
      <span className="text-[10px] text-gray-400 shrink-0 hidden sm:block">{totalChunks} sections</span>
      <button type="button" onClick={onAdd} disabled={isUploading}
        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-bold shrink-0 disabled:opacity-30">
        {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
        Add
      </button>
    </div>
  );
}

function UploadZone({ isDragging, isUploading, onBrowse, multiple, title, subtitle }: {
  isDragging: boolean; isUploading: boolean; onBrowse: () => void; multiple?: boolean;
  title?: string; subtitle?: string;
}) {
  return (
    <div className="h-full flex items-center justify-center py-8">
      <div onClick={!isUploading ? onBrowse : undefined}
        className={cn(
          'w-full max-w-2xl p-14 rounded-2xl border-2 border-dashed text-center cursor-pointer transition-all',
          isDragging ? 'border-purple-500 bg-purple-500/5 scale-[1.01]' : 'border-gray-700 hover:border-purple-500/50 hover:bg-[#141414]',
          isUploading && 'pointer-events-none opacity-70'
        )}>
        {isUploading ? (
          <>
            <Loader2 className="mx-auto w-12 h-12 animate-spin text-gray-400 mb-4" />
            <p className="font-bold text-lg text-white">Processing files…</p>
            <p className="text-sm text-gray-400 mt-2">First upload may take 1–2 minutes.</p>
          </>
        ) : (
          <>
            <UploadCloud className="mx-auto w-14 h-14 text-gray-400 mb-5" />
            <p className="font-bold text-2xl mb-2 text-white">{title ?? 'Drop your documents here'}</p>
            <p className="text-sm text-gray-400 mb-4 max-w-md mx-auto">{subtitle ?? 'PDF, Word, text, or images'}</p>
            <p className="text-xs text-gray-500">
              Click to browse{multiple ? ' • multiple files OK' : ''} • {ACCEPTED_LABEL}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function InteractiveQuiz({ questions }: { questions: QuizQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);

  useEffect(() => {
    setIndex(0);
    setPicked(null);
    setChecked(false);
    setScore(0);
  }, [questions]);

  if (!questions || questions.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-purple-500/30 bg-[#1a1a1a]">
        <p className="text-sm text-gray-400">No quiz questions available.</p>
      </div>
    );
  }

  const q = questions[index];
  const isLast = index >= questions.length - 1;

  const check = () => {
    if (!picked) return;
    setChecked(true);
    if (picked === q.correct_answer) setScore(s => s + 1);
  };

  const next = () => {
    if (index < questions.length - 1) {
      setIndex(i => i + 1);
      setPicked(null);
      setChecked(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl border border-purple-500/30 bg-[#1a1a1a] space-y-5">
      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>Question {index + 1} of {questions.length}</span>
        <span>Score: {score}/{questions.length}</span>
      </div>
      <p className="font-semibold text-base leading-relaxed text-white">{q.question}</p>
      <div className="space-y-2">
        {["A", "B", "C", "D"].map(letter => {
          const option = q.options.find(o => o.startsWith(letter));
          if (!option) return null;
          const isCorrect = letter === q.correct_answer;
          const isPicked = letter === picked;
          let style = 'border-gray-700 hover:border-purple-400';
          if (checked) {
            if (isCorrect) style = 'border-green-500 bg-green-500/10';
            else if (isPicked && !isCorrect) style = 'border-red-500 bg-red-500/10';
          } else if (isPicked) {
            style = 'border-purple-500 bg-purple-500/10';
          }
          return (
            <button key={letter} type="button" disabled={checked}
              onClick={() => setPicked(letter)}
              className={cn('w-full text-left p-3 rounded-xl border transition-all text-sm text-white', style)}>
              <span className="font-bold mr-2">{letter}.</span>{option.slice(3)}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        {!checked ? (
          <button type="button" onClick={check} disabled={!picked}
            className="px-5 py-2 rounded-lg bg-purple-600 text-white font-bold text-sm disabled:opacity-40">
            Check answer
          </button>
        ) : !isLast ? (
          <button type="button" onClick={next}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm">
            Next question
          </button>
        ) : (
          <p className="text-sm font-medium text-green-400">
            Quiz complete — you got {score} out of {questions.length} correct.
          </p>
        )}
      </div>
    </div>
  );
}

function FlashcardsView({ flashcards }: { flashcards: Flashcard[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
  }, [flashcards]);

  if (!flashcards || flashcards.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-purple-500/30 bg-[#1a1a1a]">
        <p className="text-sm text-gray-400">No flashcards available.</p>
      </div>
    );
  }

  const card = flashcards[index];

  const next = () => {
    if (index < flashcards.length - 1) {
      setIndex(i => i + 1);
      setFlipped(false);
    }
  };

  const prev = () => {
    if (index > 0) {
      setIndex(i => i - 1);
      setFlipped(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl border border-purple-500/30 bg-[#1a1a1a] space-y-5">
      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>Flashcard {index + 1} of {flashcards.length}</span>
      </div>
      <div 
        onClick={() => setFlipped(!flipped)} 
        className="cursor-pointer p-8 rounded-xl bg-gradient-to-br from-purple-900/30 to-indigo-900/30 border border-purple-500/30 min-h-[200px] flex items-center justify-center transition-transform hover:scale-[1.01]"
      >
        <p className="text-lg font-medium text-white text-center">
          {flipped ? card.answer : card.question}
        </p>
      </div>
      <p className="text-xs text-gray-500 text-center">Click to flip</p>
      <div className="flex justify-between gap-2">
        <button type="button" onClick={prev} disabled={index === 0}
          className="px-5 py-2 rounded-lg border border-gray-700 text-white font-bold text-sm disabled:opacity-40">
          Previous
        </button>
        <button type="button" onClick={next} disabled={index === flashcards.length - 1}
          className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm disabled:opacity-40">
          Next
        </button>
      </div>
    </div>
  );
}

function StudyView({ tool, study, hasFiles, isThinking, isDragging, isUploading, onBrowse, onDragOver, onDragLeave, onDrop, uploadCopy, onGenerate }: {
  tool: typeof NAV_ITEMS[number]; study: StudyContent | null; hasFiles: boolean;
  isThinking: boolean;
  isDragging: boolean; isUploading: boolean; onBrowse: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  uploadCopy: { title: string; subtitle: string }; onGenerate: () => void;
}) {
  const content = study?.content ?? null;

  if (!hasFiles) {
    return (
      <div className="flex-1 min-h-0 flex flex-col"
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <UploadZone
          isDragging={isDragging}
          isUploading={isUploading}
          onBrowse={onBrowse}
          multiple
          title={uploadCopy.title}
          subtitle={uploadCopy.subtitle}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto min-h-0"
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <button onClick={onGenerate} disabled={isThinking}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm disabled:opacity-40">
            {content ? 'Regenerate' : 'Generate'}
          </button>
        </div>
        {isThinking && !content && (
          <div className="flex items-center gap-2 text-gray-400 p-6 rounded-2xl border border-gray-700 bg-[#1a1a1a]">
            <Loader2 className="animate-spin" /> Generating…
          </div>
        )}
        {content && tool.id === 'quiz' && <InteractiveQuiz questions={content as QuizQuestion[]} />}
        {content && tool.id === 'flashcards' && <FlashcardsView flashcards={content as Flashcard[]} />}
        {(content && (tool.id === 'summary' || tool.id === 'key_points' || tool.id === 'explain' || tool.id === 'practice')) && (
          <div className="p-6 rounded-2xl border border-gray-700 bg-[#1a1a1a] text-white text-sm">
            <FormattedMessage content={content as string} />
          </div>
        )}
        {!content && !isThinking && (
          <p className="text-sm text-gray-400 text-center py-8">
            Documents ready — click Generate to create your {tool.label.toLowerCase()}.
          </p>
        )}
      </div>
      {isDragging && (
        <div className="fixed inset-0 bg-purple-500/10 border-4 border-dashed border-purple-500 flex items-center justify-center z-40 pointer-events-none">
          <p className="text-lg font-bold text-white">Drop files to add</p>
        </div>
      )}
    </div>
  );
}



export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [input, setInput] = useState('');
  const [activeView, setActiveView] = useState<ActiveView>('chat');
  const [isUploading, setIsUploading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [studyContent, setStudyContent] = useState<StudyContent | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showToolsNav, setShowToolsNav] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasFiles = files.length > 0;
  const activeModule = NAV_ITEMS.find(t => t.id === activeView)!;
  const user = session?.user
    ? { email: session.user.email ?? '', name: session.user.user_metadata?.full_name || session.user.email || 'User' }
    : null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const [authEmail, setAuthEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [authError, setAuthError] = useState('');

  const handleSendMagicLink = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim()) return;
    setAuthError('');
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setAuthError(error.message);
    else setMagicLinkSent(true);
  }, [authEmail]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    setConversations([]);
    setActiveChatId(null);
    setMessages([]);
    setFiles([]);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((type: Toast['type'], message: string) => setToast({ type, message }), []);

  const fetchFiles = useCallback(async (convId: number) => {
    try {
      const res = await api.get(`/files/${convId}`);
      setFiles(res.data.files || []);
      setTotalChunks(res.data.total_chunks || 0);
    } catch {
      setFiles([]);
      setTotalChunks(0);
    }
  }, []);

  const loadConversation = useCallback(async (convId: number) => {
    try {
      const res = await api.get(`/conversations/${convId}/messages`);
      setMessages(res.data.messages || []);
      setActiveChatId(convId);
      await fetchFiles(convId);
    } catch {
      showToast('error', 'Could not load chat.');
    }
  }, [fetchFiles, showToast]);

  const refreshConversations = useCallback(async () => {
    const res = await api.get('/conversations');
    setConversations(res.data);
    return res.data as Conversation[];
  }, []);

  // Initialize app once signed in
  useEffect(() => {
    if (!session) return;
    const init = async () => {
      setIsInitializing(true);
      try {
        const res = await api.get("/auth/me");
        setConversations(res.data.conversations || []);
        const convs = res.data.conversations;
        if (convs?.length) await loadConversation(convs[0].id);
        else {
          const newRes = await api.post("/conversations", { title: "New chat" });
          await loadConversation(newRes.data.id);
        }
      } catch (error) {
        console.error("Initialization error:", error);
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, [session]);

  const handleNewChat = useCallback(async () => {
    try {
      const res = await api.post('/conversations', { title: 'New chat' });
      await refreshConversations();
      setActiveChatId(res.data.id);
      setMessages([]);
      setFiles([]);
      setTotalChunks(0);
      setStudyContent(null);
      setActiveView('chat');
    } catch {
      showToast('error', 'Could not create new chat.');
    }
  }, [refreshConversations, showToast]);

  const handleDeleteChat = useCallback(async (convId: number) => {
    try {
      await api.delete(`/conversations/${convId}`);
      const convs = await refreshConversations();
      if (convs.length === 0) {
        const res = await api.post('/conversations', { title: 'New chat' });
        await loadConversation(res.data.id);
      } else if (activeChatId === convId) {
        await loadConversation(convs[0].id);
      }
    } catch {
      showToast('error', 'Could not delete chat.');
    }
  }, [refreshConversations, loadConversation, activeChatId, showToast]);

  const uploadFiles = useCallback(async (fileList: FileList | File[]) => {
    if (!activeChatId) return;
    const arr = Array.from(fileList);
    const allowed = ['pdf', 'docx', 'txt', 'jpg', 'jpeg', 'png'];

    setIsUploading(true);
    let added = 0;
    for (const file of arr) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !allowed.includes(ext)) {
        showToast('error', `"${file.name}" — unsupported type. Use ${ACCEPTED_LABEL}.`);
        continue;
      }
      showToast('info', `Processing "${file.name}"…`);
      const formData = new FormData();
      formData.append('file', file);
      try {
        await api.post(`/upload?conversation_id=${activeChatId}`, formData);
        added++;
      } catch (err: any) {
        const msg = err.response?.data?.detail || `Failed: ${file.name}`;
        showToast('error', msg);
      }
    }
    await fetchFiles(activeChatId);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (added > 0) showToast('success', `${added} file(s) added successfully.`);
  }, [activeChatId, fetchFiles, showToast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) uploadFiles(e.target.files);
  }, [uploadFiles]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  }, [uploadFiles]);

  const removeFile = useCallback(async (filename: string) => {
    if (!activeChatId) return;
    try {
      await api.delete(`/files/${activeChatId}/${encodeURIComponent(filename)}`);
      await fetchFiles(activeChatId);
      showToast('success', `Removed "${filename}"`);
    } catch {
      showToast('error', 'Could not remove file.');
    }
  }, [activeChatId, fetchFiles, showToast]);

  const handleSend = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeChatId || isThinking || !hasFiles) {
      if (!hasFiles) showToast('error', 'Upload at least one document first.');
      return;
    }

    const question = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setInput('');
    setIsThinking(true);
    setStudyContent(null);

    try {
      const res = await api.post('/chat', { conversation_id: activeChatId, question });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.answer }]);
      await refreshConversations();
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
    } finally {
      setIsThinking(false);
    }
  }, [input, activeChatId, isThinking, hasFiles, showToast, refreshConversations]);

  const switchModule = useCallback(async (view: ActiveView) => {
    setActiveView(view);
    if (view !== 'chat') {
      setStudyContent(null);
    }
  }, []);

  const generateStudy = useCallback(async (tool: StudyToolId, force = false) => {
    if (!activeChatId) return;
    if (!hasFiles) {
      showToast('error', 'Upload documents first.');
      return;
    }
    if (!force && studyContent) return;

    setIsThinking(true);
    try {
      const res = await api.post('/study', {
        conversation_id: activeChatId,
        tool,
      });
      setStudyContent({ content: res.data.content, format: res.data.format || tool });
    } catch {
      showToast('error', 'Could not generate. Click Generate to try again.');
    } finally {
      setIsThinking(false);
    }
  }, [activeChatId, hasFiles, studyContent, showToast]);

  if (authLoading) {
    return (
      <div className="flex h-screen bg-[#0a0a0a] text-white font-sans items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!session || !user) {
    return (
      <div className="flex h-screen bg-[#0a0a0a] text-white font-sans items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Brain className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold mb-1">Study Assistant</h1>
          {magicLinkSent ? (
            <p className="text-sm text-gray-300">
              Check <span className="font-semibold text-white">{authEmail}</span> for a sign-in link.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-6">Sign in with your email to continue.</p>
              <form onSubmit={handleSendMagicLink} className="space-y-3">
                <input type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-[#1a1a1a] border border-gray-700 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-sm text-white" />
                <button type="submit"
                  className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold text-sm">
                  Send sign-in link
                </button>
              </form>
              {authError && <p className="text-xs text-red-400 mt-3">{authError}</p>}
            </>
          )}
        </div>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="flex h-screen bg-[#0a0a0a] text-white font-sans items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto w-8 h-8 animate-spin text-gray-400 mb-4" />
          <p className="text-lg font-medium">Loading Study Assistant...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

      {showSidebar && (
      <aside className="w-64 border-r border-gray-800 flex flex-col bg-[#141414] shrink-0">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center shrink-0">
              <Brain className="text-white w-4 h-4" />
            </div>
            <span className="font-bold text-sm tracking-tight">Study Assistant</span>
          </div>
          <div className="flex items-center gap-2 overflow-hidden min-w-0 mb-4">
            <div className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-gray-700 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-gray-400" />
            </div>
            <div className="overflow-hidden min-w-0 flex-1">
              <p className="font-bold truncate text-sm">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
            <button onClick={handleSignOut} title="Sign out"
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1a1a1a] shrink-0">
              <LogOut size={16} />
            </button>
          </div>
          <button onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold hover:bg-[#1a1a1a]">
            <Plus size={16} />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map(conv => (
            <div key={conv.id} className={cn(
              'group flex items-center gap-1 rounded-lg',
              activeChatId === conv.id ? 'bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/30' : 'hover:bg-[#1a1a1a]'
            )}>
              <button onClick={() => loadConversation(conv.id)}
                className="flex-1 text-left px-3 py-2 text-sm truncate min-w-0 text-gray-300 hover:text-white">
                {conv.title}
              </button>
              <button onClick={() => handleDeleteChat(conv.id)}
                className="p-2 opacity-0 group-hover:opacity-60 hover:!opacity-100 shrink-0 text-gray-400 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </aside>
      )}

      <main className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]">
        <header className="border-b border-gray-800 shrink-0 bg-[#141414]">
          <div className="h-14 flex items-center px-6 justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setShowSidebar(v => !v)}
                title={showSidebar ? 'Hide chats' : 'Show chats'}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all duration-150 border',
                  showSidebar
                    ? 'bg-purple-600/15 border-purple-500/40 text-purple-300 hover:bg-purple-600/25 hover:border-purple-400/60'
                    : 'bg-[#1c1c1c] border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 hover:bg-[#222]'
                )}
              >
                {showSidebar ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
                <span className="hidden sm:inline">{showSidebar ? 'Chats' : 'Chats'}</span>
              </button>
              <button
                onClick={() => setShowToolsNav(v => !v)}
                title={showToolsNav ? 'Hide tools' : 'Show tools'}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all duration-150 border',
                  showToolsNav
                    ? 'bg-purple-600/15 border-purple-500/40 text-purple-300 hover:bg-purple-600/25 hover:border-purple-400/60'
                    : 'bg-[#1c1c1c] border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 hover:bg-[#222]'
                )}
              >
                {showToolsNav ? <PanelRightClose size={15} /> : <PanelRight size={15} />}
                <span className="hidden sm:inline">{showToolsNav ? 'Tools' : 'Tools'}</span>
              </button>
              <div className="min-w-0">
                <h2 className="font-bold text-white truncate">{activeModule.label}</h2>
                <p className="text-xs text-gray-500 truncate">{activeModule.desc}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isThinking && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 className="animate-spin" /> Working…
                </div>
              )}
              {activeChatId && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  title="Upload documents"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-semibold shrink-0 disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  {isUploading ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                  Upload
                </button>
              )}
            </div>
          </div>
          {hasFiles && (
            <DocumentsBar
              files={files}
              totalChunks={totalChunks}
              isUploading={isUploading}
              onAdd={() => fileInputRef.current?.click()}
              onRemove={removeFile}
            />
          )}
        </header>

        <div className="flex-1 overflow-hidden flex">
          {showToolsNav && (
          <nav className="w-48 border-r border-gray-800 bg-[#141414] shrink-0 p-2 space-y-1">
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => switchModule(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
                  activeView === item.id ? 'bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/30 text-white' : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'
                )}>
                <item.icon size={18} />
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>
          )}

          <div className="flex-1 flex flex-col min-w-0">
            {activeView === 'chat' ? (
              <>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0"
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}>
                  {!activeChatId ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4 py-16">
                      <MessageSquare size={48} className="text-gray-500 opacity-40" />
                      <p className="text-lg font-medium text-white">Start a conversation</p>
                      <button onClick={handleNewChat}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm">
                        New chat
                      </button>
                    </div>
                  ) : !hasFiles ? (
                    <UploadZone
                      isDragging={isDragging}
                      isUploading={isUploading}
                      onBrowse={() => fileInputRef.current?.click()}
                      multiple
                      title="Upload to start chatting"
                      subtitle="Drop PDFs, Word docs, text, or images here."
                    />
                  ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3 py-16">
                      <CheckCircle2 size={40} className="text-green-500" />
                      <p className="text-lg font-medium text-white">{files.length} document{files.length !== 1 ? 's' : ''} ready</p>
                      <p className="text-sm">Ask anything about your uploaded files.</p>
                    </div>
                  ) : (
                    messages.map((msg, i) => (
                      <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                        <div className={cn(
                          'max-w-[85%] p-4 rounded-2xl text-sm',
                          msg.role === 'user'
                            ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-br-md'
                            : 'bg-[#1a1a1a] border border-gray-700 text-white rounded-bl-md'
                        )}>
                          {msg.role === 'assistant' ? (
                            <FormattedMessage content={msg.content} />
                          ) : (
                            <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {isDragging && hasFiles && (
                    <div className="fixed inset-0 bg-purple-500/10 border-4 border-dashed border-purple-500 flex items-center justify-center z-40 pointer-events-none">
                      <p className="text-lg font-bold text-white">Drop files to add</p>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-gray-800 shrink-0 bg-[#141414]">
                  <form onSubmit={handleSend} className="relative flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || !activeChatId}
                      title="Upload a document"
                      className="p-3 rounded-xl bg-[#1a1a1a] border border-gray-700 text-gray-400 hover:text-purple-400 hover:border-purple-500/50 transition-colors disabled:opacity-40 shrink-0"
                    >
                      {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
                    </button>
                    <input type="text" value={input} onChange={e => setInput(e.target.value)}
                      placeholder={hasFiles ? 'Ask about your documents…' : 'Upload a document to start chatting…'}
                      disabled={!hasFiles || !activeChatId}
                      className="flex-1 bg-[#1a1a1a] border border-gray-700 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-sm text-white disabled:opacity-50" />
                    <button type="submit" disabled={!input.trim() || isThinking || !hasFiles || !activeChatId}
                      className="px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white disabled:opacity-30">
                      <Send size={18} />
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <StudyView
                tool={activeModule}
                study={studyContent}
                hasFiles={hasFiles}
                isThinking={isThinking}
                isDragging={isDragging}
                isUploading={isUploading}
                onBrowse={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                uploadCopy={{ title: 'Upload materials', subtitle: 'Add documents for this study tool.' }}
                onGenerate={() => generateStudy(activeView as StudyToolId, true)}
              />
            )}
          </div>
        </div>
      </main>

      <input ref={fileInputRef} type="file" className="hidden" accept={ACCEPTED_TYPES}
        multiple onChange={handleFileSelect} />
    </div>
  );
}