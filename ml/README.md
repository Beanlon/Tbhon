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

## Outputs

Each run creates a timestamped folder under `ml/runs/` containing:
- `model.pt`: PyTorch weights
- `config.json`: full run configuration
- `metrics.json`: accuracy, F1, confusion matrix, etc.
- `confusion_matrix.png`

## Inference (after training)

```bash
python train_tb_cough_cnn.py --predict "C:\path\to\cough.wav" --model "ml\runs\<run>\model.pt"
```

## Mobile integration (record → upload → result)

The mobile app uploads the recorded audio to a local HTTP endpoint.

1) Start the inference server:

```bash
python -m pip install -r ml/requirements.txt
set TB_MODEL_PATH=ml\runs\<run>\model.pt
python -m uvicorn ml.infer_api:app --host 0.0.0.0 --port 8000
```

2) Point the Expo app at your server by setting:
- `EXPO_PUBLIC_TB_API_URL` (recommended), e.g. `http://192.168.1.10:8000`

Then record coughs in the app; the `Processing` screen will upload the clips and route to `Result`.

