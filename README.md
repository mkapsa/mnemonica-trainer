# Mnemonica Trainer

A small offline-first PWA for memorizing Juan Tamariz's Mnemonica stack.

- **Drills:** card → position, position → card, next card, previous card, or mixed. Answer by typing (number pad or rank + suit picker) or by flashcard self-grading.
- **Adaptive:** cards you miss or answer slowly come up more often. A card counts as mastered after 4 quick correct answers in a row.
- **Speed run:** all 52 cards against the clock, +5s per miss.
- **Stack browser:** study cards in order, swipe through them, and save your own memory hook for each one.
- **Progress:** a heat map of all 52 cards, accuracy, average answer time, and the cards that need work.

Plain HTML/CSS/JS with no build step. Progress lives in `localStorage` on the device.
