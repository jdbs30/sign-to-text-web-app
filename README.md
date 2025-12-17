# 🤚 Hand Gesture Translator

A real-time hand gesture recognition app built with **Next.js**, **React**, **Tailwind CSS**, and **MediaPipe Hands**. This project allows users to "type" letters with hand gestures and commit words using a special **NEXT** gesture. The core recognition is powered by a **Multi-Layer Perceptron (MLP) model** trained on hand landmarks.

---

## Features

- Recognizes individual letters from hand landmarks using a trained **MLP model**.
- Hold a letter for **2 seconds** to commit it to the current word.
- Hold the **NEXT** gesture for **2 seconds** to commit the word to the sentence.
- Real-time **progress bars** for letter and word holds.
- Minimalist, dark-themed UI with intuitive controls.
- **Backspace** for the current word.
- Flip camera view.
- Optional **debug panel** to view landmark info and detection heuristics.

---

## Demo

![Screenshot](./screenshot.png)  

*(Add a screenshot or GIF of your app here)*

---

## MLP Model Training

The app uses a **Multi-Layer Perceptron (MLP)** to classify hand landmarks into letters:

- **Input:** 21 hand landmarks × 3 coordinates = 63 features.
- **Output:** 27 classes (A-Z + space).
- **Training:**
  - Landmarks were collected using MediaPipe Hands.
  - Preprocessed and normalized before training.
  - Model trained with TensorFlow/Keras using `categorical_crossentropy` loss.
- **Saving & Loading:** The trained model is saved and loaded in the frontend to perform real-time prediction.

> The `detectChar` utility wraps the model inference logic and heuristic post-processing for live recognition.

---

## Installation

1. Clone the repository:

```bash
git clone https://github.com/your-username/hand-gesture-translator.git
cd hand-gesture-translator

2. Install dependencies:

    bash
    Copy code
    npm install
    # or
    yarn install

3. Start the development server:

    bash
    Copy code
    npm run dev
    # or
    yarn dev

4. Open http://localhost:3000 in your browser.

Usage
    Allow camera access when prompted.
    Position your hand in front of the camera.
    The detected letter appears on the canvas.
    Hold a letter for 2 seconds to add it to the pending word.
    Hold the NEXT gesture for 2 seconds to commit the word to the sentence.
    Use the Backspace button to delete the last letter of the current word.
    Flip the camera view or toggle debug mode as needed.
    Clear all text using the Clear All button.

Project Structure
graphql
Copy code
.
├─ app/
│  └─ page.tsx          # Main React component for gesture detection
├─ utils/
│  ├─ detectChar.ts     # Letter detection & MLP inference
│  └─ handTypes.ts      # Hand landmark type definitions
├─ public/              # Static assets (images, icons)
├─ models/              # Pre-trained MLP model files (optional)
├─ styles/              # Tailwind custom styles
├─ package.json
└─ README.md
Configuration

LETTER_HOLD_MS: Time in ms to hold a letter before committing (default 2000ms).
NEXT_HOLD_MS: Time in ms to hold the NEXT gesture before committing a word (default 2000ms).
Debugging can be toggled via the Show Debug button.
Technologies Used
Next.js – React framework
React
Tailwind CSS
MediaPipe Hands – Hand landmark detection
TensorFlow / Keras – MLP model training
TypeScript

Contributing
Fork the repository.

Create a new branch: git checkout -b feature/my-feature

Commit your changes: git commit -m "Add new feature"

Push to the branch: git push origin feature/my-feature

Open a Pull Request.

License
This project is licensed under the MIT License. See the LICENSE file for details.

Acknowledgements
Inspired by MediaPipe Hand Tracking examples.

Thanks to the creators of Tailwind CSS and Next.js.