# TB cough audio classifier (Mel Spectrogram + CNN)

This folder contains a simple end-to-end training script for detecting TB-related acoustic patterns from respiratory/cough audio using **log-Mel spectrograms** and a **CNN**.

## Setup

```bash
cd ml
python -m pip install -r requirements.txt
```

Notes:
- The dataset is downloaded automatically using `kagglehub`.
- You may need Kaggle credentials depending on your setup.

## Train

Train on Fold 0 (default), save to `ml/runs/`:

```bash
python train_tb_cough_cnn.py --fold 0 --epochs 20 --batch-size 32
```

Legacy baseline (best known fold-0 checkpoint used this architecture):

```bash
python train_tb_cough_cnn.py --fold 0 --epochs 20 --legacy-arch --n-mels 64 --clip-seconds 4
```

**Recommended — hybrid CNN + gradient boosting** (higher accuracy):

```bash
python train_tb_cough_hybrid.py --fold 0 --cnn-epochs 12 --gbm-estimators 400
```

Train all 3 folds and evaluate a 3-model ensemble:

```bash
python train_cv_ensemble.py --folds 0,1,2 --cnn-epochs 8 --gbm-estimators 300
```

Run the ablation matrix from the plan:

```bash
python run_ablation.py
```

## Outputs

Each run creates a timestamped folder under `ml/runs/` containing:
- `model.pt`: PyTorch weights (best validation checkpoint; test metrics stored in checkpoint)
- `config.json`: full run configuration
- `metrics.json`: **test-fold** accuracy/F1 for the best checkpoint (not the last epoch)
- `epoch_log.jsonl`: per-epoch validation metrics
- `confusion_matrix.png`: test-fold confusion matrix for the best checkpoint

## Inference (after training)

Production checkpoint is pinned in `ml/production_model.json` (currently **hybrid fold 1**, test macro-F1 **~0.69**).

```bash
python -m pip install -r ml/requirements.txt
python -m uvicorn ml.infer_api:app --host 0.0.0.0 --port 8000
```

`infer_api` loads models in this order: `TB_MODEL_PATH` env → `production_model.json` → highest `best_f1_macro` under `ml/runs/`.

Confirm the active model:

```bash
curl http://127.0.0.1:8000/healthz
```

### Deploy best hybrid to ML droplet

From repo root (requires SSH to `152.42.170.30`):

```bash
npm run ml:deploy-cough
```

Uploads `model.pt` + `hybrid_bundle.pkl`, sets `TB_MODEL_PATH`, restarts `tbhon-ml`.

After a new training run beats the current F1:

```bash
python ml/scripts/promote_cough_model.py
npm run ml:deploy-cough
```

Legacy CNN-only baseline (~0.63 F1): `ml/runs/20260504_005928/model.pt`.

## Mobile integration (record → upload → result)

Point the Expo app at your ML server:

- `EXPO_PUBLIC_TB_API_URL` (recommended), e.g. `http://192.168.1.10:8000` or the ML Cloudflare tunnel URL

Then record coughs in the app; the `Processing` screen will upload the clips and route to `Result`.
## Validation

Smoke tests (no running server):

```bash
python smoke_test_infer.py
```

Validate a folder of cough clips (IoT/phone exports):

```bash
python validate_app_audio.py path\to\cough_clips\
```
