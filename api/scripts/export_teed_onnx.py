"""Ekspor TEED (fal-ai/teed) ke ONNX supaya worker bisa menjalankannya tanpa torch.

Dipanggil saat build image worker setelah fetch_models.py (bobot sudah di cache Hugging Face):
    uv run --no-sync --with onnx python scripts/export_teed_onnx.py /app/.cache/rerupa/teed.onnx
Keluaran model = rata-rata semua peta tepi TEED (sebelum sigmoid), sama dengan TEEDdetector.
Sengaja tidak mengimpor kode aplikasi (lapisan Docker ini dibangun sebelum kode disalin).
"""

import os
import sys

import torch
from controlnet_aux import TEEDdetector

out = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/.cache/rerupa/teed.onnx")
os.makedirs(os.path.dirname(out), exist_ok=True)
model = TEEDdetector.from_pretrained("fal-ai/teed", filename="5_model.pth").model.eval()


class MeanEdges(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, x):
        return torch.stack([o[:, 0] for o in self.m(x)], 1).mean(1, keepdim=True)


with torch.inference_mode():
    torch.onnx.export(
        MeanEdges(model).eval(), torch.rand(1, 3, 512, 512) * 255, out,
        input_names=["image"], output_names=["edges"],
        dynamic_axes={"image": {2: "h", 3: "w"}, "edges": {2: "h", 3: "w"}},
        opset_version=17, dynamo=False,
    )
print(f"TEED ONNX: {out} ({os.path.getsize(out) // 1024} KB)")
