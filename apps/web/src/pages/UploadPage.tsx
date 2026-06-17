export default function UploadPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Upload</h1>
      <p className="text-muted">Drop a PDF, DOCX, PPTX, or lecture audio. (wired Day 2)</p>
      <div className="mt-6 border-2 border-dashed border-white/20 rounded-2xl p-12 text-center text-muted">
        Drag &amp; drop or tap to choose a file
      </div>
    </div>
  );
}
