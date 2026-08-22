import type { EnvDef } from "../types";
import { c } from "../ansi";
import { canned, rule, streamed } from "../shell";

const HOME = "/Users/gary";
const ROOT = `${HOME}/dev/torch-lab`;

const trainPy = `"""Fine-tune a small vision transformer on the parts-defect dataset."""
import argparse

import torch
from torch.utils.data import DataLoader

from tlab.data import DefectDataset
from tlab.model import TinyViT
from tlab.train import fit


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--batch-size", type=int, default=64)
    args = ap.parse_args()

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = TinyViT(num_classes=4).to(device)
    train_dl = DataLoader(DefectDataset("data/train"), batch_size=args.batch_size, shuffle=True)
    val_dl = DataLoader(DefectDataset("data/val"), batch_size=args.batch_size)

    fit(model, train_dl, val_dl, epochs=args.epochs, lr=args.lr, device=device)


if __name__ == "__main__":
    main()
`;

const requirements = `torch==2.5.1
torchvision==0.20.1
numpy==2.1.3
pillow==11.0.0
tensorboard==2.18.0
pytest==8.3.4
ruff==0.8.4
`;

const metricsTest = `import pytest

from tlab.metrics import f1_macro, precision_at_k


def test_f1_macro_perfect():
    assert f1_macro([0, 1, 2], [0, 1, 2]) == 1.0


def test_f1_macro_empty_raises():
    with pytest.raises(ValueError):
        f1_macro([], [])


def test_precision_at_k_stable_under_ties():
    scores = [0.9, 0.9, 0.1]
    labels = [1, 0, 1]
    # tie-break must be deterministic (stable sort) or CI flakes
    assert precision_at_k(scores, labels, k=2) == 0.5
`;

export const torchLab: EnvDef = {
  id: "torch-lab",
  label: "torch-lab",
  kind: "local",
  user: "gary",
  hostname: "macbook",
  shell: "zsh",
  home: HOME,
  defaultCwd: ROOT,
  context: {
    branch: "main",
    dirtyFiles: 1,
    runtime: "python 3.12.4 (.venv)",
    packageManager: "pip 24.3",
  },
  envVars: {
    PATH: `${ROOT}/.venv/bin:/opt/homebrew/bin:/usr/bin:/bin`,
    VIRTUAL_ENV: `${ROOT}/.venv`,
    PYTORCH_ENABLE_MPS_FALLBACK: "1",
    SHELL: "/bin/zsh",
  },
  files: {
    [ROOT]: null,
    [`${ROOT}/README.md`]: "# torch-lab\n\nDefect-classification experiments (TinyViT on parts-defect).\n\n- `python train.py --epochs 12` — train\n- `pytest` — unit tests\n- `tensorboard --logdir runs` — metrics on :6006\n",
    [`${ROOT}/train.py`]: trainPy,
    [`${ROOT}/eval.py`]: "\"\"\"Evaluate a checkpoint on the held-out test split.\"\"\"\n# usage: python eval.py --ckpt runs/exp7/best.pt\n",
    [`${ROOT}/requirements.txt`]: requirements,
    [`${ROOT}/pyproject.toml`]: `[project]\nname = "torch-lab"\nversion = "0.3.0"\nrequires-python = ">=3.12"\n\n[tool.ruff]\nline-length = 100\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n`,
    [`${ROOT}/tlab`]: null,
    [`${ROOT}/tlab/model.py`]: "# TinyViT: 4-block ViT, patch 16, dim 192 — small enough for MPS\n",
    [`${ROOT}/tlab/metrics.py`]: "def f1_macro(y_true, y_pred):\n    if not y_true:\n        raise ValueError(\"empty labels\")\n    ...\n\ndef precision_at_k(scores, labels, k):\n    # NOTE: sorted() is stable in CPython — relied on by tie-break test\n    ...\n",
    [`${ROOT}/tests/test_metrics.py`]: metricsTest,
    [`${ROOT}/runs`]: null,
    [`${ROOT}/runs/exp7/best.pt`]: "<binary: 22.4 MB checkpoint>",
    [`${ROOT}/data/train`]: null,
    [`${ROOT}/data/val`]: null,
  },
  commands: [
    // training run — the long-running centerpiece; graceful on Ctrl+C
    rule(/^python3? train\.py/, async (ctx) => {
      const epochsArg = /--epochs\s+(\d+)/.exec(ctx.raw);
      const epochs = epochsArg ? parseInt(epochsArg[1], 10) : 12;
      ctx.registerProcess({ name: "python3.12", cmd: `python ${ctx.raw.replace(/^python3? /, "")}`, cpu: 87.3, mem: 2140, ports: [] });
      ctx.emit(`device: ${c.brcyan}mps${c.reset} · params: 5.4M · train: 18,432 imgs · val: 2,048 imgs\n`);
      await ctx.sleep(1200);
      let loss = 1.62;
      let acc = 0.41;
      for (let e = 1; e <= epochs; e++) {
        for (const pct of [25, 50, 75, 100]) {
          await ctx.sleep(500 + Math.random() * 400);
          if (ctx.signal.cancelled) {
            ctx.emit(`\n${c.yellow}KeyboardInterrupt${c.reset} — saving interrupt checkpoint to runs/exp8/interrupt.pt ... done\n`);
            return 130;
          }
          if (pct < 100) {
            ctx.emit(`${c.gray}epoch ${e}/${epochs} · ${pct}% · loss ${(loss + Math.random() * 0.05).toFixed(3)}${c.reset}\n`);
          }
        }
        loss = Math.max(0.18, loss * (0.82 + Math.random() * 0.06));
        acc = Math.min(0.968, acc + (0.93 - acc) * 0.28);
        const isBest = e > 1;
        ctx.emit(`epoch ${c.bold}${e}/${epochs}${c.reset} · train_loss ${loss.toFixed(3)} · val_acc ${c.green}${(acc * 100).toFixed(1)}%${c.reset}${isBest ? ` ${c.gray}· saved runs/exp8/best.pt${c.reset}` : ""}\n`);
      }
      ctx.emit(`\ndone in ${(epochs * 2.1).toFixed(1)}m · best val_acc ${c.green}${(acc * 100).toFixed(1)}%${c.reset} · checkpoint runs/exp8/best.pt\n`);
      return 0;
    }),

    rule(/^pytest($|\s)/, async (ctx) => {
      const single = ctx.raw.includes("::");
      ctx.emit(`${c.bold}========================= test session starts =========================${c.reset}\n`);
      ctx.emit(`platform darwin -- Python 3.12.4, pytest-8.3.4\nrootdir: ${ROOT}\nconfigfile: pyproject.toml\n`);
      await ctx.sleep(700);
      if (ctx.signal.cancelled) return 130;
      if (single) {
        ctx.emit(`collected 1 item\n\ntests/test_metrics.py ${c.red}F${c.reset}                                        ${c.red}[100%]${c.reset}\n\n`);
      } else {
        ctx.emit(`collected 24 items\n\n`);
        await ctx.sleep(500);
        ctx.emit(`tests/test_data.py ${c.green}........${c.reset}                                  ${c.gray}[ 33%]${c.reset}\n`);
        await ctx.sleep(400);
        ctx.emit(`tests/test_metrics.py ${c.green}....${c.reset}${c.red}F${c.reset}${c.green}..${c.reset}                              ${c.gray}[ 62%]${c.reset}\n`);
        await ctx.sleep(400);
        ctx.emit(`tests/test_model.py ${c.green}.........${c.reset}                                ${c.gray}[100%]${c.reset}\n\n`);
      }
      ctx.emit(`${c.bold}============================== FAILURES ===============================${c.reset}\n`);
      ctx.emit(`${c.red}${c.bold}____________________ test_precision_at_k_stable_under_ties ____________________${c.reset}\n\n`);
      ctx.emit(`    def test_precision_at_k_stable_under_ties():\n        scores = [0.9, 0.9, 0.1]\n        labels = [1, 0, 1]\n${c.red}>       assert precision_at_k(scores, labels, k=2) == 0.5${c.reset}\n${c.red}E       assert 1.0 == 0.5${c.reset}\n\n${c.red}tests/test_metrics.py${c.reset}:16: AssertionError\n`);
      ctx.emit(`${c.bold}======================= short test summary info =======================${c.reset}\n`);
      ctx.emit(`${c.red}FAILED${c.reset} tests/test_metrics.py::test_precision_at_k_stable_under_ties - assert 1.0 == 0.5\n`);
      ctx.emit(single
        ? `${c.red}========================== 1 failed in 0.31s ==========================${c.reset}\n`
        : `${c.red}==================== 1 failed, 23 passed in 2.84s =====================${c.reset}\n`);
      return 1;
    }),

    streamed(/^pip install -r requirements\.txt$/, [
      "Requirement already satisfied: torch==2.5.1 in ./.venv/lib/python3.12/site-packages (2.5.1)",
      "Requirement already satisfied: torchvision==0.20.1 in ./.venv/lib/python3.12/site-packages (0.20.1)",
      "Requirement already satisfied: numpy==2.1.3 in ./.venv/lib/python3.12/site-packages (2.1.3)",
      "Requirement already satisfied: tensorboard==2.18.0 in ./.venv/lib/python3.12/site-packages (2.18.0)",
      "Requirement already satisfied: pytest==8.3.4 in ./.venv/lib/python3.12/site-packages (8.3.4)",
    ], { delay: 130 }),

    rule(/^tensorboard --logdir/, async (ctx) => {
      const holder = ctx.portInUse(6006);
      if (holder) {
        await ctx.sleep(900);
        ctx.emit(`${c.red}ERROR:${c.reset} TensorBoard could not bind to port 6006, it was already in use\n`);
        return 1;
      }
      ctx.registerProcess({ name: "tensorboard", cmd: "tensorboard --logdir runs", cpu: 3.1, mem: 380, ports: [6006] });
      await ctx.sleep(1500);
      if (ctx.signal.cancelled) return 130;
      ctx.emit(`TensorBoard 2.18.0 at ${c.brcyan}http://localhost:6006/${c.reset} (Press CTRL+C to quit)\n`);
      while (!ctx.signal.cancelled) await ctx.sleep(4000);
      return 130;
    }),

    canned(/^nvidia-smi$/, `${"zsh"}: command not found: nvidia-smi`, 127, 40),
    canned(/^python3? -c ['"]import torch.*mps.*['"]?$/, "True", 0, 1400),
    canned(/^python3? eval\.py --ckpt runs\/exp7\/best\.pt$/, `loaded runs/exp7/best.pt (5.4M params)\ntest split: 2,304 imgs\n\n  class        precision  recall  f1\n  scratch          0.94    0.91  0.92\n  dent             0.89    0.93  0.91\n  discolor         0.96    0.95  0.95\n  ok               0.98    0.98  0.98\n\n${c.bold}macro f1: 0.94${c.reset}`, 0, 3200),
    canned(/^source \.venv\/bin\/activate$/, "", 0, 30),
    canned(/^python3? (-V|--version)$/, "Python 3.12.4", 0, 40),
    canned(/^ruff check( \.)?$/, `All checks passed!`, 0, 600),
    canned(/^git status$/, `On branch ${c.green}main${c.reset}\nYour branch is up to date with 'origin/main'.\n\nChanges not staged for commit:\n\t${c.red}modified:   tlab/metrics.py${c.reset}\n\nno changes added to commit`, 0, 90),
    canned(/^git log/, `${c.yellow}a41f9d2${c.reset} ${c.gray}(HEAD -> main, origin/main)${c.reset} metrics: add precision_at_k\n${c.yellow}5c00e17${c.reset} train: cosine LR schedule + grad clipping\n${c.yellow}91b3aa8${c.reset} data: augmentations for the defect classes\n${c.yellow}c7e51f0${c.reset} initial TinyViT training loop`, 0, 90),
  ],
  seedHistory: [
    { command: "source .venv/bin/activate", exitCode: 0, hoursAgo: 96, durationMs: 60 },
    { command: "pip install -r requirements.txt", exitCode: 0, hoursAgo: 96, durationMs: 14200 },
    { command: "python train.py --epochs 12", exitCode: 0, hoursAgo: 95, durationMs: 1512_000 },
    { command: "tensorboard --logdir runs", exitCode: 130, hoursAgo: 94, durationMs: 5400_000 },
    { command: "python eval.py --ckpt runs/exp7/best.pt", exitCode: 0, hoursAgo: 72, durationMs: 41_000 },
    { command: "pytest", exitCode: 0, hoursAgo: 71, durationMs: 3100 },
    { command: "ruff check .", exitCode: 0, hoursAgo: 48, durationMs: 800 },
    { command: "python train.py --epochs 24 --lr 1e-4", exitCode: 130, hoursAgo: 26, durationMs: 2680_000 },
    { command: "pytest", exitCode: 1, hoursAgo: 3, durationMs: 3400 },
    { command: "cat tlab/metrics.py", exitCode: 0, hoursAgo: 3, durationMs: 40 },
  ],
  baseProcesses: [],
};
