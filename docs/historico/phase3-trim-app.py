from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src" / "App.tsx"
lines = p.read_text(encoding="utf-8").splitlines(keepends=True)

start = end = None
for i, line in enumerate(lines):
    if line.startswith("const getUrlParams"):
        start = i
    if start is not None and line.startswith("// ─── AppContent"):
        end = i
        break

if start is None or end is None:
    raise SystemExit(f"markers not found: {start} {end}")

lines = lines[:start] + lines[end:]
text = "".join(lines)

old_modal = """      {modalConfig && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-xs shadow-2xl animate-in zoom-in duration-300 space-y-6 flex flex-col items-center">
            {modalConfig.icon && <div className="mb-2">{modalConfig.icon}</div>}
            <h3 className="text-2xl font-black mb-4 text-center">{modalConfig.title}</h3>
            <p className="text-black font-black mb-6 leading-tight text-center">{modalConfig.message}</p>
            <div className="flex gap-3 w-full">
              {modalConfig.onCancel && <button onClick={() => modalConfig.onCancel!()} className={`flex-1 py-4 rounded-[1.5rem] font-black text-xs tracking-widest active:scale-95 transition-all ${modalConfig.cancelLabel ? 'bg-green-500 text-white shadow-lg shadow-green-100' : 'bg-gray-200 text-gray-700'}`}>{modalConfig.cancelLabel || 'Cancelar'}</button>}
              <button onClick={() => { modalConfig.onConfirm(); }} className={`flex-1 py-4 rounded-[1.5rem] font-black text-xs tracking-widest active:scale-95 transition-all ${modalConfig.variant === 'danger' ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'bg-blue-600 text-white shadow-lg shadow-blue-100'}`}>{modalConfig.confirmLabel || 'Ok'}</button>
            </div>
          </div>
        </div>
      )}"""

new_modal = "      <AppModal modalConfig={modalConfig} />"

if old_modal not in text:
    raise SystemExit("modal block not found")
text = text.replace(old_modal, new_modal)

p.write_text(text, encoding="utf-8")
print("OK lines:", text.count("\n") + 1)
