/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { 
  Download, 
  Trash2, 
  Plus, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Globe, 
  Image as ImageIcon,
  Check,
  X,
  ExternalLink,
  Github,
  Maximize2,
  Minimize2,
  Sparkles,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { saveAs } from 'file-saver';
import confetti from 'canvas-confetti';

interface ScrapedImage {
  id: string;
  url: string;
  sourceUrl: string;
  selected: boolean;
  name?: string;
}

export default function App() {
  const [links, setLinks] = useState<string[]>(['']);
  const [images, setImages] = useState<ScrapedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [baseFileName, setBaseFileName] = useState('image');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [downloadStates, setDownloadStates] = useState<{ [key: string]: 'idle' | 'fetching' | 'saving' | 'success' | 'failed' }>({});
  const [downloadDelay, setDownloadDelay] = useState<number>(1500); // Jeda unduhan bawaan 1.5 detik agar berurutan lancar di browser
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err: any) => {
        console.error("Gagal masuk mode layar penuh:", err);
      });
    } else {
      document.exitFullscreen().catch((err: any) => {
        console.error("Gagal keluar mode layar penuh:", err);
      });
    }
  };

  const handleAddLink = () => {
    setLinks([...links, '']);
  };

  const handleLinkChange = (index: number, value: string) => {
    const newLinks = [...links];
    newLinks[index] = value;
    setLinks(newLinks);
  };

  const handleRemoveLink = (index: number) => {
    if (links.length > 1) {
      const newLinks = links.filter((_, i) => i !== index);
      setLinks(newLinks);
    }
  };

  const scrapeImages = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    
    // Filter out empty links
    const validLinks = links.filter(l => l.trim().startsWith('http'));
    
    if (validLinks.length === 0) {
      setError('Please enter at least one valid website link (starting with http:// or https://)');
      setIsLoading(false);
      return;
    }

    let allScrapedImages: ScrapedImage[] = [];

    try {
      for (const link of validLinks) {
        const response = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: link.trim() }),
        });

        if (!response.ok) {
          let errorMessage = `Gagal memproses ${link}`;
          try {
            const data = await response.json();
            errorMessage = data.error || errorMessage;
          } catch (e) {
            // Jika bukan JSON (misal HTML error page), ambil status text
            errorMessage = `Server Error (${response.status}): ${response.statusText || 'Halaman tidak ditemukan atau server bermasalah'}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        const newImages: ScrapedImage[] = data.images.map((imgUrl: string, idx: number) => ({
          id: `${link}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
          url: imgUrl,
          sourceUrl: link,
          selected: true
        }));
        
        allScrapedImages = [...allScrapedImages, ...newImages];
      }

      if (allScrapedImages.length === 0) {
        setError('No images found on the provided links.');
      } else {
        setImages(prev => [...prev, ...allScrapedImages]);
        setSuccess(`Successfully found ${allScrapedImages.length} images!`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleImageSelection = (id: string) => {
    setImages(images.map(img => 
      img.id === id ? { ...img, selected: !img.selected } : img
    ));
  };

  const selectAll = () => {
    setImages(images.map(img => ({ ...img, selected: true })));
  };

  const selectNone = () => {
    setImages(images.map(img => ({ ...img, selected: false })));
  };

  const clearAll = () => {
    setImages([]);
    setSuccess(null);
    setError(null);
    setDownloadStates({});
  };

  const downloadAll = async () => {
    const selectedImages = images.filter(img => img.selected);
    
    if (selectedImages.length === 0) {
      setError('Silakan pilih minimal satu gambar untuk diunduh.');
      return;
    }

    setDownloading(true);
    setError(null);
    setSuccess(`Memulai pengunduhan ${selectedImages.length} gambar secara berurutan...`);

    // Inisialisasi status unduhan untuk melacak proses satu per satu
    const initialStates: { [key: string]: 'idle' | 'fetching' | 'saving' | 'success' | 'failed' } = {};
    selectedImages.forEach(img => {
      initialStates[img.id] = 'idle';
    });
    setDownloadStates(initialStates);

    let downloadedCount = 0;
    let failedCount = 0;

    try {
      for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i];
        
        // Atur status gambar saat ini menjadi 'fetching' (sedang mengambil data)
        setDownloadStates(prev => ({ ...prev, [img.id]: 'fetching' }));
        
        try {
          const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(img.url)}&referer=${encodeURIComponent(img.sourceUrl)}`;
          const response = await fetch(proxyUrl);
          
          if (!response.ok) {
            throw new Error(`Status: ${response.status}`);
          }
          
          const blob = await response.blob();
          
          // Atur status menjadi 'saving' setelah data berhasil didownload penuh ke memori
          setDownloadStates(prev => ({ ...prev, [img.id]: 'saving' }));
          
          const contentType = response.headers.get('Content-Type');
          let ext = 'jpg';
          if (contentType) {
            ext = contentType.split('/')[1]?.split('+')[0] || 'jpg';
          } else {
            const match = img.url.match(/\.([a-zA-Z0-9]+)(\?|$)/);
            if (match) ext = match[1];
          }
          if (ext === 'jpeg') ext = 'jpg';

          const paddedIndex = (i + 1).toString().padStart(3, '0');
          const fileName = `${baseFileName}_${paddedIndex}.${ext}`;
          
          // Trigger download browser
          saveAs(blob, fileName);
          downloadedCount++;
          
          // Set status menjadi 'success'
          setDownloadStates(prev => ({ ...prev, [img.id]: 'success' }));
        } catch (err) {
          console.error(`Gagal mendownload ${img.url}:`, err);
          failedCount++;
          // Set status menjadi 'failed'
          setDownloadStates(prev => ({ ...prev, [img.id]: 'failed' }));
        }

        // Tampilkan progress real-time ke pengguna sesuai urutan file
        setSuccess(`Mendownload: ${downloadedCount}/${selectedImages.length} selesai (${failedCount} gagal)...`);
        
        // Berikan jeda waktu antar file agar browser sempat memproses penyimpanan file sebelumnya
        // dan menghindari penumpukan atau urutan acak karena antrean browser.
        await new Promise(resolve => setTimeout(resolve, downloadDelay));
      }

      if (downloadedCount > 0) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
        
        setSuccess(`Berhasil mengunduh ${downloadedCount} gambar secara berurutan! ${failedCount > 0 ? `(${failedCount} gagal)` : ''}`);
      } else {
        setError('Gagal mengunduh semua gambar. Website tujuan kemungkinan memblokir akses.');
      }
    } catch (err: any) {
      setError(`Pengunduhan gagal: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col p-4 md:p-8 relative overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Ambient Neon Background Orbs */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-10 right-1/4 w-[500px] h-[500px] bg-fuchsia-500/10 rounded-full blur-[160px] pointer-events-none translate-x-1/2 translate-y-1/2" />

      {/* Header */}
      <header className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 border-b border-slate-800/85 pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-fuchsia-400 drop-shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <Zap className="text-cyan-400 animate-pulse" size={28} />
            BulkImage.io Neon
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1 flex items-center gap-1.5">
            <Sparkles size={13} className="text-fuchsia-400" />
            Scrape, sequence & download website images in perfect order
          </p>
        </div>

        {/* Full Screen Toggle Button */}
        <button 
          onClick={toggleFullscreen}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer border bg-slate-900/60 text-slate-300 border-slate-800 hover:bg-cyan-500/10 hover:text-cyan-400 hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] active:scale-95"
          title="Toggle Fullscreen Mode"
        >
          {isFullscreen ? <Minimize2 size={14} className="text-cyan-400" /> : <Maximize2 size={14} className="text-cyan-400" />}
          <span>{isFullscreen ? 'Layar Biasa' : 'Layar Penuh'}</span>
        </button>
      </header>

      <div className="relative z-10 flex flex-1 gap-8 overflow-hidden flex-col lg:flex-row">
        {/* Left Side: Input Controls (Sidebar) */}
        <aside className="w-full lg:w-80 flex flex-col gap-6 shrink-0">
          <section className="bg-slate-900/75 backdrop-blur-md p-6 rounded-2xl border border-slate-800 shadow-[0_0_20px_rgba(0,0,0,0.3)] focus-within:border-cyan-500/30 transition-all duration-350">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
              <Download className="text-cyan-400" size={16} />
              <label className="block text-[10px] font-black uppercase tracking-widest text-cyan-400">Filename Settings</label>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Base Filename</label>
                <input
                  type="text"
                  value={baseFileName}
                  onChange={(e) => setBaseFileName(e.target.value)}
                  placeholder="e.g. image"
                  className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(6,182,212,0.2)] outline-none transition-all duration-200"
                />
                <p className="text-[9px] text-slate-500 mt-1.5">Format: <span className="text-cyan-400/80 font-mono">{baseFileName}_001.jpg</span>, dst.</p>
              </div>

              <div className="pt-3 border-t border-slate-800/50">
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Jeda Antar Unduhan (Detik)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.5"
                    value={downloadDelay / 1000}
                    onChange={(e) => setDownloadDelay(parseFloat(e.target.value) * 1000)}
                    className="flex-1 h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-400 border border-slate-800"
                  />
                  <span className="text-xs font-black text-cyan-400 bg-cyan-950/40 border border-cyan-500/20 px-2 py-1 rounded-md min-w-[44px] text-center shadow-[0_0_8px_rgba(6,182,212,0.15)]">
                    {downloadDelay / 1000}s
                  </span>
                </div>
                <p className="text-[9px] text-slate-500 mt-2 leading-relaxed">
                  Menjaga unduhan tetap <span className="font-semibold text-cyan-400/95">satu per satu</span> sesuai urutan untuk menghindari penumpukan antrean browser.
                </p>
              </div>
            </div>
          </section>

          <section className="bg-slate-900/75 backdrop-blur-md p-6 rounded-2xl border border-slate-800 shadow-[0_0_20px_rgba(0,0,0,0.3)] focus-within:border-cyan-500/30 transition-all duration-350">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
              <Globe className="text-cyan-400" size={16} />
              <label className="block text-[10px] font-black uppercase tracking-widest text-cyan-400">Website Links</label>
            </div>
            <div className="space-y-3">
              {links.map((link, index) => (
                <div key={index} className="flex gap-2 group">
                  <div className="relative flex-1">
                    <input
                      type="url"
                      value={link}
                      onChange={(e) => handleLinkChange(index, e.target.value)}
                      placeholder="Paste link here..."
                      className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(6,182,212,0.2)] outline-none transition-all duration-200"
                    />
                  </div>
                  {links.length > 1 && (
                    <button
                      onClick={() => handleRemoveLink(index)}
                      className="p-2.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all rounded-xl"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              
              <button
                onClick={handleAddLink}
                className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-slate-800 rounded-xl text-slate-500 hover:border-cyan-500/50 hover:text-cyan-400 hover:bg-cyan-500/5 transition-all text-xs font-medium cursor-pointer"
              >
                <Plus size={16} />
                Tambah Link
              </button>

              <button
                onClick={scrapeImages}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 py-3 rounded-xl font-extrabold shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] hover:from-cyan-300 hover:to-blue-400 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? <Loader2 className="animate-spin text-slate-950" size={18} /> : <ImageIcon className="text-slate-950" size={18} />}
                {isLoading ? 'Sedang Memproses...' : 'Scrape Semua Gambar'}
              </button>
            </div>
          </section>

          {/* Notifications */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-red-950/20 text-red-300 p-4 rounded-xl flex flex-col gap-2 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.15)]"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={16} />
                  <p className="text-xs font-semibold leading-relaxed text-red-200">{error}</p>
                </div>
                <div className="mt-1 p-2 bg-slate-950/40 rounded-lg border border-red-500/10">
                  <p className="text-[10px] text-red-400 font-medium">
                    <span className="font-bold">TIPS:</span> Jika gagal, web tersebut mungkin memiliki proteksi yang kuat. Coba gunakan link dari <span className="font-bold underline text-red-300">website cermin/alternatif lainnya</span>.
                  </p>
                </div>
              </motion.div>
            )}
            {success && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-emerald-950/30 text-emerald-300 p-4 rounded-xl flex items-start gap-3 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
              >
                <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={16} />
                <p className="text-xs font-semibold leading-relaxed text-emerald-200">{success}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>

        {/* Main Content: Image Grid */}
        <main className="flex-1 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 flex flex-col overflow-hidden shadow-[0_0_25px_rgba(0,0,0,0.4)]">
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-950/40 gap-3">
            <span className="text-sm font-bold text-slate-300 flex items-center gap-2">
              <ImageIcon size={15} className="text-cyan-400" />
              {images.length > 0 ? (
                <>
                  Pustaka Gambar ditemukan
                  <span className="text-cyan-400 font-extrabold font-mono text-xs bg-cyan-950/30 border border-cyan-500/25 px-2 py-0.5 rounded-md shadow-[0_0_8px_rgba(6,182,212,0.15)]">
                    {images.filter(i => i.selected).length}/{images.length} Terpilih
                  </span>
                </>
              ) : (
                'Pustaka Gambar'
              )}
            </span>
            {images.length > 0 && (
              <div className="flex gap-2 w-full sm:w-auto">
                <button 
                  onClick={selectAll}
                  className="flex-1 sm:flex-initial text-center text-[10px] sm:text-xs font-extrabold text-cyan-400 px-3 py-1.5 hover:bg-cyan-500/10 border border-cyan-500/20 hover:border-cyan-500/50 rounded-lg transition-all hover:shadow-[0_0_10px_rgba(6,182,212,0.2)] cursor-pointer"
                >
                  Pilih Semua
                </button>
                <button 
                  onClick={selectNone}
                  className="flex-1 sm:flex-initial text-center text-[10px] sm:text-xs font-extrabold text-slate-450 px-3 py-1.5 hover:bg-slate-800 border border-slate-800 rounded-lg transition-all cursor-pointer"
                >
                  Batal Semua
                </button>
                <button 
                  onClick={clearAll}
                  className="flex-1 sm:flex-initial text-center text-[10px] sm:text-xs font-extrabold text-rose-400 px-3 py-1.5 hover:bg-rose-500/10 border border-rose-500/20 hover:border-rose-500/50 rounded-lg transition-all hover:shadow-[0_0_10px_rgba(244,63,94,0.2)] cursor-pointer"
                >
                  Bersihkan
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 p-6 overflow-y-auto min-h-[400px]">
            {images.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <div className="flex flex-col items-center max-w-xs">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 rounded-full bg-cyan-500/10 blur-xl animate-pulse" />
                    <div className="w-16 h-16 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.25)]">
                      <ImageIcon size={32} className="text-cyan-400" />
                    </div>
                  </div>
                  <h3 className="font-extrabold text-slate-200 text-lg uppercase tracking-wider">Pustaka Kosong</h3>
                  <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed">Masukkan atau tempel link website di sebelah kiri untuk mulai mengekstrak dan memproses gambar secara otomatis.</p>
                </div>
                
                <div className="mt-8 p-4 bg-amber-950/20 rounded-2xl border border-amber-500/20 max-w-sm shadow-[0_0_15px_rgba(245,158,11,0.05)] text-left">
                  <div className="flex items-center gap-2 mb-2 text-amber-300">
                    <AlertCircle size={15} />
                    <span className="text-[10px] font-black uppercase tracking-wider">Panduan Mengatasi Masalah</span>
                  </div>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed font-medium">
                    Jika gambar tidak muncul lengkap atau halaman kosong, website tujuan mungkin memblokir sistem kami secara langsung. <strong>Solusinya:</strong> Gunakan link cermin/alternatif atau website hosting manga lain untuk chapter tersebut.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 content-start">
                {images.map((img) => (
                  <motion.div
                    key={img.id}
                    layout
                    className={`relative aspect-square rounded-xl overflow-hidden group border-2 cursor-pointer transition-all duration-300 ${
                      img.selected 
                        ? 'border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)] scale-[0.98]' 
                        : 'border-slate-800 hover:border-cyan-400/30'
                    }`}
                    onClick={() => toggleImageSelection(img.id)}
                  >
                    {/* Selection Indicator */}
                    <div className={`absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-lg flex items-center justify-center transition-all border ${
                      img.selected 
                        ? 'bg-gradient-to-r from-cyan-400 to-blue-500 border-cyan-400 text-slate-950 shadow-[0_0_10px_rgba(6,182,212,0.5)]' 
                        : 'bg-slate-950/80 border-slate-700 backdrop-blur-sm text-slate-400'
                    }`}>
                      {img.selected && <Check size={14} className="text-slate-950" strokeWidth={3.5} />}
                    </div>

                    {/* Real-time Sequential Download Progress Log */}
                    {downloadStates[img.id] && downloadStates[img.id] !== 'idle' && (
                      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-[2px] flex flex-col items-center justify-center p-2 text-center text-white z-20 animate-fade-in">
                        {downloadStates[img.id] === 'fetching' && (
                          <>
                            <Loader2 size={24} className="text-amber-400 animate-spin mb-2" />
                            <span className="text-[10px] font-bold text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.3)]">Mengunduh...</span>
                            <span className="text-[8px] text-slate-400 mt-1">Mengambil data</span>
                          </>
                        )}
                        {downloadStates[img.id] === 'saving' && (
                          <>
                            <Loader2 size={24} className="text-cyan-400 animate-spin mb-2" />
                            <span className="text-[10px] font-bold text-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.3)]">Menyimpan...</span>
                            <span className="text-[8px] text-slate-400 mt-1">Merekam ke disk</span>
                          </>
                        )}
                        {downloadStates[img.id] === 'success' && (
                          <>
                            <CheckCircle2 size={24} className="text-emerald-400 mb-2 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
                            <span className="text-[10px] font-bold text-emerald-300">Selesai</span>
                            <span className="text-[8px] text-emerald-500 mt-1">Sesuai Urutan</span>
                          </>
                        )}
                        {downloadStates[img.id] === 'failed' && (
                          <>
                            <AlertCircle size={24} className="text-rose-450 mb-2 drop-shadow-[0_0_8px_rgba(244,63,94,0.3)]" />
                            <span className="text-[10px] font-bold text-rose-300">Gagal</span>
                            <span className="text-[8px] text-slate-400 mt-1">Gagal mengambil</span>
                          </>
                        )}
                      </div>
                    )}

                    <img 
                      src={img.url} 
                      alt=""
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        // If direct load fails (common with strict hotlink protection), try the proxy as a fallback
                        if (!target.src.includes('/api/proxy-image')) {
                          console.log('Direct load failed, trying proxy for:', img.url);
                          target.src = `/api/proxy-image?url=${encodeURIComponent(img.url)}&referer=${encodeURIComponent(img.sourceUrl)}`;
                        } else {
                          // If proxy also fails, show the fallback UI
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.classList.add('bg-slate-900', 'flex', 'flex-col', 'items-center', 'justify-center', 'p-4', 'gap-1.5', 'text-center', 'border-slate-800');
                            parent.innerHTML = `
                              <div class="text-[10px] text-rose-400 font-black uppercase tracking-wider drop-shadow-[0_0_6px_rgba(244,63,94,0.2)]">Access Blocked</div>
                              <a href="${img.url}" target="_blank" rel="noreferrer" class="text-[9px] bg-slate-950 border border-slate-800 px-2 py-1.5 rounded-lg text-cyan-400 hover:text-cyan-300 hover:border-cyan-500/40 font-semibold shadow-inner mt-1">View Original</a>
                            `;
                          }
                        }
                      }}
                    />

                    {/* Meta info on hover */}
                    <div className="absolute bottom-0 left-0 right-0 bg-slate-950/85 text-slate-300 text-[9px] p-2 opacity-0 group-hover:opacity-100 transition-all duration-200 flex justify-between items-center backdrop-blur-[2px]">
                      <span className="truncate max-w-[75%] font-mono text-[8px] text-cyan-400">{new URL(img.sourceUrl).hostname}</span>
                      <a 
                        href={img.url} 
                        target="_blank" 
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-cyan-300 p-1 rounded-md transition-colors"
                      >
                        <ExternalLink size={11} className="text-cyan-400" />
                      </a>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Download Action */}
          <div className="p-4 sm:p-6 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-bold text-slate-200">
                {images.filter(i => i.selected).length} Berkas Gambar
              </p>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block animate-ping" />
                Siap Diunduh Satu Per Satu
              </p>
            </div>
            <button 
              onClick={downloadAll}
              disabled={downloading || images.length === 0}
              className="flex items-center gap-2 bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white px-5 sm:px-8 py-2.5 sm:py-3.5 rounded-xl text-xs sm:text-sm font-bold shadow-[0_0_15px_rgba(217,70,239,0.3)] hover:shadow-[0_0_25px_rgba(217,70,239,0.55)] hover:from-fuchsia-400 hover:to-pink-500 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed cursor-pointer"
            >
              {downloading ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  <span>Proses Mengunduh...</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>Unduh Gambar</span>
                </>
              )}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
