/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from 'react';
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
  Github
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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col p-4 md:p-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            <Download className="text-indigo-600" size={24} />
            BulkImage.io
          </h1>
          <p className="text-sm text-slate-500">Extract and sequence images from any URL</p>
        </div>
      </header>

      <div className="flex flex-1 gap-8 overflow-hidden flex-col lg:flex-row">
        {/* Left Side: Input Controls (Sidebar) */}
        <aside className="w-full lg:w-80 flex flex-col gap-6">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Download className="text-indigo-600" size={18} />
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Filename Settings</label>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Base Filename</label>
                <input
                  type="text"
                  value={baseFileName}
                  onChange={(e) => setBaseFileName(e.target.value)}
                  placeholder="e.g. image"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-600 outline-none transition-all"
                />
                <p className="text-[9px] text-slate-400 mt-1">Format Nama File: {baseFileName}_001.jpg, {baseFileName}_002.jpg, dst.</p>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Jeda Antar Unduhan (Detik)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.5"
                    value={downloadDelay / 1000}
                    onChange={(e) => setDownloadDelay(parseFloat(e.target.value) * 1000)}
                    className="flex-1 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md min-w-[44px] text-center">
                    {downloadDelay / 1000}s
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 mt-1.5 leading-relaxed">
                  Menjaga unduhan tetap <span className="font-semibold text-slate-600">satu per satu</span> sesuai urutan & memberikan waktu bagi sistem operasi untuk merekam file ke disk sebelum file berikutnya diproses.
                </p>
              </div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="text-indigo-600" size={18} />
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Website Links</label>
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
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-600 outline-none transition-all"
                    />
                  </div>
                  {links.length > 1 && (
                    <button
                      onClick={() => handleRemoveLink(index)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              
              <button
                onClick={handleAddLink}
                className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-indigo-600 hover:text-indigo-600 transition-all text-xs font-medium"
              >
                <Plus size={16} />
                Add Link
              </button>

              <button
                onClick={scrapeImages}
                disabled={isLoading}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : <ImageIcon size={18} />}
                {isLoading ? 'Fetching...' : 'Fetch All Images'}
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
                className="bg-red-50 p-4 rounded-xl flex flex-col gap-2 border border-red-100"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                  <p className="text-xs text-red-800">{error}</p>
                </div>
                <div className="mt-1 p-2 bg-white/50 rounded-lg border border-red-200">
                  <p className="text-[10px] text-red-600 font-medium">
                    <span className="font-bold">TIP:</span> Jika gambar tidak muncul lengkap, web tersebut mungkin memiliki proteksi bot yang kuat. Silakan coba gunakan link dari <span className="font-bold underline">website mirror/alternatif lainnya</span>.
                  </p>
                </div>
              </motion.div>
            )}
            {success && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-green-50 p-4 rounded-xl flex items-start gap-3 border border-green-100"
              >
                <CheckCircle2 className="text-green-500 shrink-0 mt-0.5" size={16} />
                <p className="text-xs text-green-800">{success}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>

        {/* Main Content: Image Grid */}
        <main className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <span className="text-sm font-medium text-slate-700">
              {images.length > 0 ? (
                <>
                  {images.length} Images Found 
                  <span className="text-slate-400 font-normal ml-2">({images.filter(i => i.selected).length} selected)</span>
                </>
              ) : (
                'Image Library'
              )}
            </span>
            {images.length > 0 && (
              <div className="flex gap-2">
                <button 
                  onClick={selectAll}
                  className="text-xs font-semibold text-indigo-600 px-2 py-1 hover:bg-indigo-50 rounded transition-colors"
                >
                  Select All
                </button>
                <button 
                  onClick={selectNone}
                  className="text-xs font-semibold text-slate-500 px-2 py-1 hover:bg-slate-100 rounded transition-colors"
                >
                  Deselect All
                </button>
                <button 
                  onClick={clearAll}
                  className="text-xs font-semibold text-red-500 px-2 py-1 hover:bg-red-50 rounded transition-colors"
                >
                  Clear Results
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 p-6 overflow-y-auto min-h-[400px]">
            {images.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="opacity-40 flex flex-col items-center">
                  <ImageIcon size={48} className="text-slate-300 mb-4" />
                  <h3 className="font-semibold text-slate-900">Your library is empty</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs transition-opacity">Paste some links to populate this space with images.</p>
                </div>
                
                <div className="mt-8 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 max-w-sm">
                  <div className="flex items-center gap-2 mb-2 text-indigo-700">
                    <AlertCircle size={14} />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Troubleshooting Tip</span>
                  </div>
                  <p className="text-[11px] text-indigo-600 leading-relaxed text-left">
                    Jika gambar tidak lengkap atau tidak muncul, website tersebut mungkin memblokir sistem kami. <strong>Solusi:</strong> Salin link dari website manhwa/manga alternatif lain (mirror) untuk chapter yang sama.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 content-start">
                {images.map((img) => (
                  <motion.div
                    key={img.id}
                    layout
                    className={`relative aspect-square rounded-xl overflow-hidden group border-2 transition-all cursor-pointer ${
                      img.selected ? 'border-indigo-500' : 'border-transparent hover:border-slate-300'
                    }`}
                    onClick={() => toggleImageSelection(img.id)}
                  >
                    {/* Selection Indicator */}
                    <div className={`absolute top-2 right-2 z-10 w-5 h-5 rounded flex items-center justify-center transition-colors border ${
                      img.selected 
                        ? 'bg-indigo-500 border-indigo-500' 
                        : 'bg-white/80 border-slate-300 backdrop-blur-sm'
                    }`}>
                      {img.selected && <Check size={12} className="text-white" strokeWidth={3} />}
                    </div>

                    {/* Real-time Sequential Download Progress Log */}
                    {downloadStates[img.id] && downloadStates[img.id] !== 'idle' && (
                      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[1px] flex flex-col items-center justify-center p-2 text-center text-white z-20 animate-fade-in">
                        {downloadStates[img.id] === 'fetching' && (
                          <>
                            <Loader2 size={22} className="text-amber-400 animate-spin mb-2" />
                            <span className="text-[10px] font-semibold text-amber-200">Mengunduh...</span>
                            <span className="text-[8px] text-slate-400 mt-0.5">Mengambil data</span>
                          </>
                        )}
                        {downloadStates[img.id] === 'saving' && (
                          <>
                            <Loader2 size={22} className="text-indigo-400 animate-spin mb-2" />
                            <span className="text-[10px] font-semibold text-indigo-300">Menyimpan...</span>
                            <span className="text-[8px] text-slate-400 mt-0.5">Merekam ke disk</span>
                          </>
                        )}
                        {downloadStates[img.id] === 'success' && (
                          <>
                            <CheckCircle2 size={22} className="text-emerald-400 mb-2" />
                            <span className="text-[10px] font-semibold text-emerald-300">Selesai</span>
                            <span className="text-[8px] text-slate-500 mt-0.5">Sesuai Urutan</span>
                          </>
                        )}
                        {downloadStates[img.id] === 'failed' && (
                          <>
                            <AlertCircle size={22} className="text-red-400 mb-2" />
                            <span className="text-[10px] font-semibold text-red-300">Gagal</span>
                            <span className="text-[8px] text-slate-500 mt-0.5">Gagal mengambil</span>
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
                            parent.classList.add('bg-slate-100', 'flex', 'flex-col', 'items-center', 'justify-center', 'p-2', 'gap-1');
                            parent.innerHTML = `
                              <div class="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Access Blocked</div>
                              <a href="${img.url}" target="_blank" rel="noreferrer" class="text-[9px] bg-white border border-slate-200 px-2 py-1 rounded shadow-sm hover:bg-slate-50 text-indigo-600 font-medium">View Original</a>
                            `;
                          }
                        }
                      }}
                    />

                    {/* Meta info on hover */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[9px] p-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-center backdrop-blur-[2px]">
                      <span className="truncate max-w-[70%]">{new URL(img.sourceUrl).hostname}</span>
                      <a 
                        href={img.url} 
                        target="_blank" 
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-indigo-300"
                      >
                        <ExternalLink size={10} />
                      </a>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Download Action */}
          <div className="p-4 sm:p-6 border-t border-slate-100 bg-white flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-semibold">{images.filter(i => i.selected).length} files</p>
              <p className="text-[10px] sm:text-xs text-slate-400">
                Ready for Sequential Download
              </p>
            </div>
            <button 
              onClick={downloadAll}
              disabled={downloading || images.length === 0}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 sm:px-8 py-2 sm:py-3 rounded-lg sm:rounded-xl text-sm font-bold hover:scale-[1.02] transition-transform disabled:opacity-30 disabled:hover:scale-100 shadow-lg shadow-slate-200"
            >
              {downloading ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  <span className="hidden sm:inline">Processing...</span>
                  <span className="sm:hidden">...</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>Download</span>
                </>
              )}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
