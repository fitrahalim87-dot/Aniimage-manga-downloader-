/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
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
  Search,
  Grid,
  Eye,
  Sliders,
  Sparkles,
  RefreshCw,
  HelpCircle,
  FileDown,
  Layers,
  ChevronRight,
  Info
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
  width?: number;
  height?: number;
}

export default function App() {
  // Navigation & Control State
  const [links, setLinks] = useState<string[]>(['']);
  const [bulkInput, setBulkInput] = useState<string>('');
  const [inputMode, setInputMode] = useState<'structured' | 'bulk'>('structured');
  
  // Library State
  const [images, setImages] = useState<ScrapedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [baseFileName, setBaseFileName] = useState('aniimage');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Advanced UX Filter & Layout State
  const [searchQuery, setSearchQuery] = useState('');
  const [gridSize, setGridSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [hideTinyImages, setHideTinyImages] = useState(true);
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(10);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<ScrapedImage | null>(null);

  // Auto scroll down to images when they load
  const libraryRef = useRef<HTMLDivElement>(null);

  // Sync rangeEnd with images length
  useEffect(() => {
    if (images.length > 0) {
      setRangeEnd(images.length);
    }
  }, [images.length]);

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
    
    // Resolve links based on current mode
    let targetLinks: string[] = [];
    if (inputMode === 'structured') {
      targetLinks = links.filter(l => l.trim().startsWith('http'));
    } else {
      // Parse bulk text area splitting by newline, commas, or spaces
      targetLinks = bulkInput
        .split(/[\n,;]+/)
        .map(l => l.trim())
        .filter(l => l.startsWith('http'));
    }
    
    if (targetLinks.length === 0) {
      setError('Harap masukkan setidaknya satu tautan website aktif yang valid (dimulai dengan http:// atau https://)');
      setIsLoading(false);
      return;
    }

    let allScrapedImages: ScrapedImage[] = [];

    try {
      for (const link of targetLinks) {
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
            errorMessage = `Server Error (${response.status}): ${response.statusText || 'Halaman tidak ditemukan atau server mengalami masalah'}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        const newImages: ScrapedImage[] = data.images.map((imgUrl: string, idx: number) => ({
          id: `${link}-${idx}-${Math.random().toString(36).substring(2, 11)}`,
          url: imgUrl,
          sourceUrl: link,
          selected: true
        }));
        
        allScrapedImages = [...allScrapedImages, ...newImages];
      }

      if (allScrapedImages.length === 0) {
        setError('Tidak ditemukan gambar pada tautan yang diberikan. Silakan periksa kembali tautannya.');
      } else {
        setImages(prev => {
          const combined = [...prev, ...allScrapedImages];
          // Simple deduplication based on image source url
          const seen = new Set();
          return combined.filter(item => {
            const duplicate = seen.has(item.url);
            seen.add(item.url);
            return !duplicate;
          });
        });
        
        setSuccess(`Berhasil memuat ${allScrapedImages.length} gambar baru!`);
        
        // Soft animation scroll to library
        setTimeout(() => {
          libraryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat memuat gambar.');
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

  const applyRangeSelection = (select: boolean) => {
    const start = Math.max(1, rangeStart) - 1;
    const end = Math.min(images.length, rangeEnd);
    
    setImages(images.map((img, idx) => {
      if (idx >= start && idx < end) {
        return { ...img, selected: select };
      }
      return img;
    }));
    
    setSuccess(`Berhasil ${select ? 'memilih' : 'membatalkan pilihan'} gambar dari indeks urutan ${rangeStart} sampai ${end}.`);
  };

  const clearAll = () => {
    setImages([]);
    setSuccess(null);
    setError(null);
  };

  // Callback to update image metadata when fully loaded in browser
  const handleImageLoad = (id: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const imgElement = e.currentTarget;
    setImages(prev => prev.map(img => 
      img.id === id 
        ? { ...img, width: imgElement.naturalWidth, height: imgElement.naturalHeight } 
        : img
    ));
  };

  // Filtering condition
  const filteredImages = images.filter(img => {
    // Search query filter
    const matchesSearch = searchQuery 
      ? img.url.toLowerCase().includes(searchQuery.toLowerCase()) || img.sourceUrl.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    
    // Hide tiny images filter
    const matchesSize = hideTinyImages && img.width && img.height
      ? img.width > 60 && img.height > 60
      : true;

    return matchesSearch && matchesSize;
  });

  const downloadAll = async () => {
    const selectedImages = filteredImages.filter(img => img.selected);
    
    if (selectedImages.length === 0) {
      setError('Pilih minimal satu gambar dari galeri untuk mulai mendownload.');
      return;
    }

    setDownloading(true);
    setError(null);
    setSuccess(`Mengunduh ${selectedImages.length} gambar berkualitas tinggi...`);

    let downloadedCount = 0;
    let failedCount = 0;

    try {
      for (let i = 0; i < selectedImages.length; i++) {
        const img = selectedImages[i];
        try {
          const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(img.url)}&referer=${encodeURIComponent(img.sourceUrl)}`;
          const response = await fetch(proxyUrl);
          
          if (!response.ok) {
            throw new Error(`Status: ${response.status}`);
          }
          
          const blob = await response.blob();
          
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
          
          saveAs(blob, fileName);
          downloadedCount++;
        } catch (err) {
          console.error(`Error downloading ${img.url}:`, err);
          failedCount++;
        }

        // Live progress reporting
        setSuccess(`Mendownload: ${downloadedCount}/${selectedImages.length} file gambar terunduh...`);
        
        // Soft pause spacing prevents parallel chrome protection blocks
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      if (downloadedCount > 0) {
        confetti({
          particleCount: 160,
          spread: 80,
          origin: { y: 0.5 }
        });
        
        setSuccess(`Selesai! Berhasil mengunduh ${downloadedCount} gambar bertitel sekuensial! ${failedCount > 0 ? `(${failedCount} file dilewati akibat proteksi server asal)` : ''}`);
      } else {
        setError('Gagal mendownload gambar. Tautan mungkin telah kedaluwarsa atau memblokir akses server.');
      }
    } catch (err: any) {
      setError(`Kesalahan tidak terduga pada download: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Absolute top glowing ambient light circles */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full filter blur-[120px] pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full filter blur-[120px] pointer-events-none" />

      {/* Modern High-End Top Navigation Panel */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-slate-900 px-4 md:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          
          {/* Stunning Brand / Logo Alignment */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-md shadow-indigo-900/30">
              <Download className="text-white animate-pulse" size={20} strokeWidth={2.5} />
              <div className="absolute -inset-0.5 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-xl blur-sm opacity-30 -z-10" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl font-bold tracking-tight text-white">
                  aniimage
                </span>
                <span className="font-display text-xl font-light tracking-tight text-indigo-400">
                  downloader
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700/50">
                  v2.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Extract, batch sequence, and easily filter website asset collections</p>
            </div>
          </div>

          {/* Quick Utility Menu Indicator (No tracking or telemetry logs) */}
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full ring-4 ring-green-500/20" />
            <span>Ready Collector State</span>
          </div>

        </div>
      </header>

      {/* Main Container Core Grid */}
      <main className="max-w-7xl w-full mx-auto px-4 md:px-8 py-8 flex-1 flex flex-col lg:flex-row gap-8">
        
        {/* Left Side: Control Inputs Board & Bulk Configurations */}
        <aside className="w-full lg:w-96 shrink-0 flex flex-col gap-6">
          
          {/* Card: URL Scraper Inputs */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-900/60 shadow-xl space-y-5">
            
            <div className="flex items-center justify-between border-b border-slate-900 pb-3">
              <div className="flex items-center gap-2.5">
                <Globe className="text-indigo-400" size={18} />
                <h2 className="font-display text-sm font-bold tracking-wide uppercase text-slate-200">
                  Tautan Website
                </h2>
              </div>
              
              {/* Dual Import Selection Tabs */}
              <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setInputMode('structured')}
                  className={`text-[10px] px-2 py-1 rounded-md font-bold transition-all ${
                    inputMode === 'structured' 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Kolom
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('bulk')}
                  className={`text-[10px] px-2 py-1 rounded-md font-bold transition-all ${
                    inputMode === 'bulk' 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Bulk Paste
                </button>
              </div>
            </div>

            {/* Input Switch Body */}
            {inputMode === 'structured' ? (
              <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                {links.map((link, index) => (
                  <div key={index} className="flex gap-2 group">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
                        <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <input
                        type="url"
                        value={link}
                        onChange={(e) => handleLinkChange(index, e.target.value)}
                        placeholder="Tempel tautan (https://...)"
                        className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-all"
                      />
                    </div>
                    {links.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLink(index)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg border border-transparent hover:border-red-500/20 transition-all shrink-0 align-middle"
                        title="Hapus tautan ini"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                
                <button
                  type="button"
                  onClick={handleAddLink}
                  className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-800 text-slate-500 hover:border-indigo-500/60 hover:text-indigo-400 transition-all text-[11px] font-semibold rounded-xl"
                >
                  <Plus size={14} />
                  Tambah Tautan Kolom
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  rows={6}
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder="Paste URL yang banyak di sini sekaligus (pisahkan per baris)...&#10;Contoh:&#10;https://webtoons.com/chapter-one&#10;https://manga-xyz.com/chapter-two"
                  className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-all font-mono resize-none leading-relaxed"
                />
                <p className="text-[10px] text-slate-500 leading-normal">
                  Tips: Pemisah otomatis mendeteksi baris baru, tanda koma, atau koma titik.
                </p>
              </div>
            )}

            {/* Fetch Master Buttons */}
            <button
              onClick={scrapeImages}
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-3 rounded-xl text-xs font-bold shadow-md hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-3 disabled:opacity-50 disabled:pointer-events-none font-display uppercase tracking-wide cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin text-white" size={16} />
                  <span>Proses Ekstraksi...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} className="text-white animate-pulse" />
                  <span>Ekstrak Semua Gambar</span>
                </>
              )}
            </button>

          </div>

          {/* Card: Sequence & Naming Adjuster */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-900/60 shadow-xl space-y-4">
            
            <div className="flex items-center gap-2.5 border-b border-slate-900 pb-3">
              <Sliders className="text-indigo-400" size={18} />
              <h2 className="font-display text-sm font-bold tracking-wide uppercase text-slate-200">
                Pemberian Nama & Format
              </h2>
            </div>
            
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Nama Dasar File (Base Name)</label>
                <input
                  type="text"
                  value={baseFileName}
                  onChange={(e) => setBaseFileName(e.target.value)}
                  placeholder="misal: image, manga_chap"
                  className="w-full px-4.5 py-2.5 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs text-white focus:border-indigo-500/80 outline-none transition-all"
                />
                <div className="flex items-center gap-1.5 mt-2 bg-slate-900/30 p-2 rounded-lg border border-slate-900/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase font-mono bg-slate-950 px-1 py-0.5 rounded">Preview:</span>
                  <span className="text-[10px] text-indigo-400 font-mono tracking-wider">{baseFileName}_001.jpg, {baseFileName}_002.png</span>
                </div>
              </div>

              {/* Automatic Filter check box */}
              <div className="flex items-center gap-2.5 bg-slate-900/30 p-3 rounded-xl border border-slate-900">
                <input
                  type="checkbox"
                  id="hideTiny"
                  checked={hideTinyImages}
                  onChange={(e) => setHideTinyImages(e.target.checked)}
                  className="accent-indigo-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="hideTiny" className="text-xs font-semibold text-slate-300 cursor-pointer select-none">
                  Sembunyikan ikon / tracker kecil (&lt; 60px)
                </label>
              </div>
            </div>

          </div>

          {/* Range Selection Card */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-900/60 shadow-xl space-y-4">
            
            <div className="flex items-center gap-2.5 border-b border-slate-900 pb-3">
              <Layers className="text-indigo-400" size={18} />
              <h2 className="font-display text-sm font-bold tracking-wide uppercase text-slate-200">
                Seleksi Sekaligus (Range)
              </h2>
            </div>

            <p className="text-[11px] text-slate-400 leading-normal">
              Pilih atau batalkan pilihan urutan gambar berskala luas dengan instan:
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Dari Urutan (#)</label>
                <input
                  type="number"
                  min={1}
                  max={images.length || 1}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 bg-slate-900/60 border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 outline-none transition-all font-mono"
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Sampai Urutan (#)</label>
                <input
                  type="number"
                  min={1}
                  max={images.length || 1}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 bg-slate-900/60 border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 outline-none transition-all font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <button
                type="button"
                onClick={() => applyRangeSelection(true)}
                disabled={images.length === 0}
                className="py-2 bg-indigo-600/20 text-indigo-200 border border-indigo-500/30 rounded-xl font-bold hover:bg-indigo-600/35 transition-all text-[11px] disabled:opacity-20 cursor-pointer"
              >
                Pilih Range
              </button>
              <button
                type="button"
                onClick={() => applyRangeSelection(false)}
                disabled={images.length === 0}
                className="py-2 bg-slate-800 text-slate-300 border border-slate-700/50 rounded-xl font-bold hover:bg-slate-750 transition-all text-[11px] disabled:opacity-20 cursor-pointer"
              >
                Batal Range
              </button>
            </div>

          </div>

          {/* Action Alerts and Troubleshooting */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-red-950/40 border border-red-500/30 p-4 rounded-xl flex flex-col gap-3 text-red-200"
              >
                <div className="flex items-start gap-2.5 text-xs">
                  <AlertCircle className="text-red-400 shrink-0 mt-0.5 animate-bounce" size={16} />
                  <p className="leading-relaxed font-medium">{error}</p>
                </div>
                <div className="bg-black/30 p-2.5 rounded-lg border border-red-500/10">
                  <p className="text-[10px] text-red-300 leading-relaxed">
                    <span className="font-bold">SOLUSI:</span> Sebagian website memblokir bot eksternal. Silakan salin URL dari website mirror, wadah komik alteratif atau link tautan terdesentralisasi lainnya.
                  </p>
                </div>
              </motion.div>
            )}
            
            {success && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-emerald-950/40 border border-emerald-500/30 p-4 rounded-xl flex items-start gap-2.5 text-emerald-200 text-xs"
              >
                <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={16} />
                <p className="font-medium leading-relaxed">{success}</p>
              </motion.div>
            )}
          </AnimatePresence>

        </aside>

        {/* Right Side: Active Image Library canvas */}
        <main 
          ref={libraryRef}
          className="flex-1 glass-panel rounded-2xl border border-slate-900/60 flex flex-col overflow-hidden shadow-2xl relative min-h-[500px]"
        >
          
          {/* Library Control Bar */}
          <div className="p-4 md:p-6 border-b border-slate-900 bg-slate-950/50 backdrop-blur-md flex flex-col sm:flex-row justify-between items-center gap-4">
            
            {/* Left label and range check details */}
            <div className="w-full sm:w-auto">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <ImageIcon size={16} className="text-indigo-400" />
                Daftar Galeri Scraping
                {images.length > 0 && (
                  <span className="text-[11px] font-normal text-slate-400 px-2 py-0.5 bg-slate-900 rounded-full border border-slate-800">
                    {filteredImages.length} ditemukan • {filteredImages.filter(i => i.selected).length} dipilih
                  </span>
                )}
              </h3>
            </div>

            {/* Middle Live Filter input */}
            <div className="relative w-full sm:w-60">
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-500">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Cari kata kunci URL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 outline-none transition-all"
              />
            </div>

            {/* Quick selectors for layout columns / select tools */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              
              {/* Grid Sizer Selection */}
              <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setGridSize('sm')}
                  title="Grid Kecil (Thumbnails Banyak)"
                  className={`p-1.5 rounded transition-all ${
                    gridSize === 'sm' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Grid size={12} className="opacity-75" />
                </button>
                <button
                  type="button"
                  onClick={() => setGridSize('md')}
                  title="Grid Sedang"
                  className={`p-1.5 rounded transition-all ${
                    gridSize === 'md' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Grid size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setGridSize('lg')}
                  title="Grid Besar (Detail Jelas)"
                  className={`p-1.5 rounded transition-all ${
                    gridSize === 'lg' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Grid size={16} strokeWidth={2.5} />
                </button>
              </div>

              {images.length > 0 && (
                <div className="flex gap-1.5 text-[11px] font-bold">
                  <button 
                    onClick={selectAll}
                    className="text-indigo-400 px-2 py-1 hover:bg-indigo-500/10 rounded-lg border border-transparent hover:border-indigo-500/20 transition-all cursor-pointer"
                  >
                    Semua
                  </button>
                  <button 
                    onClick={selectNone}
                    className="text-slate-400 px-2 py-1 hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700/50 transition-all cursor-pointer"
                  >
                    Kosongkan
                  </button>
                  <button 
                    onClick={clearAll}
                    className="text-red-400 px-2 py-1 hover:bg-red-500/10 rounded-lg border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              )}

            </div>

          </div>

          {/* Grid Canvas Frame */}
          <div className="flex-1 p-6 overflow-y-auto min-h-[450px] bg-slate-950/20">
            {images.length === 0 ? (
              <div className="h-full min-h-[350px] flex flex-col items-center justify-center text-center">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center max-w-sm"
                >
                  <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-slate-500">
                    <ImageIcon size={32} />
                  </div>
                  <h3 className="font-display font-bold text-slate-200 text-base">Galeri Unduhan Kosong</h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    Tempel tautan website manga, manhwa, dlsb di panel kiri untuk menarik semua lembar gambar berkualitas asli.
                  </p>
                  
                  <div className="mt-8 p-4 bg-indigo-950/20 rounded-2xl border border-indigo-500/15 text-left">
                    <div className="flex items-center gap-2 mb-1.5 text-indigo-400">
                      <Info size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Troubleshooting Penting</span>
                    </div>
                    <p className="text-[11px] text-indigo-300 leading-relaxed">
                      Jika hasil pencarian nihil, website tersebut kemungkinan menggunakan struktur enkripsi cloud flare. Anda cukup mencari tautan dari <strong>website alternatif / penyedia mirror lain</strong>.
                    </p>
                  </div>
                </motion.div>
              </div>
            ) : filteredImages.length === 0 ? (
              <div className="h-full min-h-[350px] flex flex-col items-center justify-center text-center">
                <p className="text-xs text-slate-500 bg-slate-905 p-4 rounded-xl border border-slate-900 max-w-xs">
                  Tidak ada gambar yang cocok dengan kata pencarian kunci atau filter filter aktif Anda saat ini.
                </p>
              </div>
            ) : (
              <div className={`grid gap-4 content-start transition-all duration-300 ${
                gridSize === 'sm' 
                  ? 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10' 
                  : gridSize === 'md' 
                    ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' 
                    : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
              }`}>
                {filteredImages.map((img, idx) => (
                  <motion.div
                    key={img.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`relative aspect-square rounded-2xl overflow-hidden group border-2 transition-all cursor-pointer ${
                      img.selected 
                        ? 'border-indigo-500 ring-4 ring-indigo-500/10 shadow-lg shadow-indigo-950/50' 
                        : 'border-slate-900 bg-slate-900/40 hover:border-slate-800'
                    }`}
                    onClick={() => toggleImageSelection(img.id)}
                  >
                    
                    {/* Index Sequence Badge */}
                    <div className="absolute top-2 left-2 z-10 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-sm text-slate-300 border border-slate-800 select-none">
                      #{idx + 1}
                    </div>

                    {/* Selection Toggle Checkbox Indicator */}
                    <div className={`absolute top-2 right-2 z-10 w-5 h-5 rounded-md flex items-center justify-center transition-colors border ${
                      img.selected 
                        ? 'bg-indigo-500 border-indigo-500 shadow' 
                        : 'bg-slate-950/60 border-slate-700/80 backdrop-blur-sm group-hover:border-slate-400'
                    }`}>
                      {img.selected && <Check size={12} className="text-white" strokeWidth={3} />}
                    </div>

                    {/* Full Size Detail Click Overlay Trigger */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPreviewImage(img);
                      }}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-5 flex items-center justify-center"
                      title="Klik untuk memperbesar / Preview"
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-950/90 flex items-center justify-center border border-white/10 text-white">
                        <Eye size={12} />
                      </div>
                    </button>

                    {/* Visual Media Engine */}
                    <img 
                      src={img.url} 
                      alt=""
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      referrerPolicy="no-referrer"
                      onLoad={(e) => handleImageLoad(img.id, e)}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        // Trigger fallback via local API proxy
                        if (!target.src.includes('/api/proxy-image')) {
                          console.log('Hotlink bypass applied to:', img.url);
                          target.src = `/api/proxy-image?url=${encodeURIComponent(img.url)}&referer=${encodeURIComponent(img.sourceUrl)}`;
                        } else {
                          // Double bypass fail, display action fallback
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.classList.add('bg-slate-900', 'flex', 'flex-col', 'items-center', 'justify-center', 'p-3', 'text-center');
                            parent.innerHTML = `
                              <div class="text-[9px] text-red-400 font-bold uppercase tracking-tight mb-1">Proteksi Ketat</div>
                              <a href="${img.url}" target="_blank" rel="noreferrer" class="text-[9px] bg-slate-950 border border-slate-850 px-2 py-1 rounded-lg text-indigo-400 font-bold hover:bg-slate-900">Link Asli ↗</a>
                            `;
                          }
                        }
                      }}
                    />

                    {/* Meta bar detail inside card on hover */}
                    <div className="absolute bottom-0 left-0 right-0 bg-slate-950/90 border-t border-slate-900 text-white text-[9px] p-2 opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-center backdrop-blur-md z-10">
                      <span className="truncate max-w-[65%] font-mono text-slate-400">{new URL(img.sourceUrl).hostname}</span>
                      <div className="flex items-center gap-1.5">
                        {img.width && img.height && (
                          <span className="text-[8px] bg-slate-900 px-1 py-0.5 rounded text-slate-400 font-mono">
                            {img.width}x{img.height}
                          </span>
                        )}
                        <a 
                          href={img.url} 
                          target="_blank" 
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-indigo-400 text-slate-300"
                        >
                          <ExternalLink size={9} />
                        </a>
                      </div>
                    </div>

                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Persistent Floating Library Action Panel */}
          <div className="p-4 md:p-6 border-t border-slate-900 bg-slate-950/80 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-slate-200">
                Ada {filteredImages.filter(i => i.selected).length} file gambar dipilih
              </p>
              <p className="text-[10px] sm:text-xs text-slate-500 font-medium">
                Sistem akan menyusun nama secara berurutan saat diunduh.
              </p>
            </div>
            
            <button 
              onClick={downloadAll}
              disabled={downloading || filteredImages.filter(i => i.selected).length === 0}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white px-8 py-3 rounded-xl text-xs font-bold transition-all disabled:opacity-20 disabled:pointer-events-none uppercase tracking-wide cursor-pointer font-display shadow-lg shadow-emerald-900/20"
            >
              {downloading ? (
                <>
                  <Loader2 className="animate-spin text-white" size={16} />
                  <span>Sedang Mengunduh...</span>
                </>
              ) : (
                <>
                  <FileDown size={16} className="text-white" />
                  <span>Download Sekaligus</span>
                </>
              )}
            </button>
          </div>

        </main>
      </main>

      {/* Lightbox / Preview Zoom Modal */}
      <AnimatePresence>
        {selectedPreviewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-lg flex items-center justify-center p-4"
            onClick={() => setSelectedPreviewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="relative max-w-4xl w-full bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl flex flex-col md:flex-row"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button 
                type="button"
                onClick={() => setSelectedPreviewImage(null)}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-slate-950/80 backdrop-blur border border-white/10 text-white flex items-center justify-center hover:bg-slate-900 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>

              {/* Left Column: Image Media */}
              <div className="flex-1 bg-black/50 p-4 flex items-center justify-center min-h-[300px] md:min-h-[450px]">
                <img 
                  src={selectedPreviewImage.url} 
                  alt="" 
                  className="max-h-[80vh] md:max-h-[60vh] object-contain rounded-lg"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Right Column: Information Panel */}
              <div className="w-full md:w-80 p-6 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-800 bg-slate-950/50">
                <div className="space-y-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                    Preview Detail
                  </span>
                  
                  <div className="space-y-1">
                    <h4 className="text-xs text-slate-400 uppercase font-bold tracking-wider">Host URL Asal</h4>
                    <p className="text-xs font-mono text-white break-all bg-slate-900 p-2 rounded-lg border border-slate-800/80">
                      {new URL(selectedPreviewImage.sourceUrl).hostname}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-xs text-slate-400 uppercase font-bold tracking-wider">URL Gambar Lengkap</h4>
                    <p className="text-[11px] font-mono text-indigo-300 break-all bg-slate-900 p-2 rounded-lg border border-slate-800/80 select-all max-h-24 overflow-y-auto">
                      {selectedPreviewImage.url}
                    </p>
                  </div>

                  {selectedPreviewImage.width && selectedPreviewImage.height && (
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                        <span className="block text-[10px] text-slate-500 uppercase font-extrabold">Lebar</span>
                        <span className="text-xs font-bold text-white font-mono">{selectedPreviewImage.width} px</span>
                      </div>
                      <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                        <span className="block text-[10px] text-slate-500 uppercase font-extrabold">Tinggi</span>
                        <span className="text-xs font-bold text-white font-mono">{selectedPreviewImage.height} px</span>
                      </div>
                    </div>
                  )}

                </div>

                <div className="pt-6 border-t border-slate-850 flex gap-2.5">
                  <a 
                    href={selectedPreviewImage.url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-800 hover:bg-slate-750 text-white rounded-xl text-xs font-bold transition-all border border-slate-705"
                  >
                    <ExternalLink size={13} />
                    Buka Tab Asli
                  </a>
                </div>

              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer copyright */}
      <footer className="border-t border-slate-900 py-6 px-4 md:px-8 mt-auto text-center text-slate-600 text-xs">
        <p>© 2026 Aniimage Downloader. Didesain secara profesional untuk kenyamanan ekstraksi media berkualitas tinggi.</p>
      </footer>
    </div>
  );
}
