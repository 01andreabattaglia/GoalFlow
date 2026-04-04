#!/usr/bin/env python3
"""
Script per sincronizzare i timestamp del video con i dati di tracking.
Chiede in input il momento (mm:ss) dell'inizio del primo e secondo tempo.
"""

import json
import re
from pathlib import Path
import tkinter as tk
from tkinter import simpledialog, messagebox


def time_to_seconds(time_str: str) -> float:
    """Converte formato mm:ss a secondi."""
    match = re.match(r'^(\d+):(\d{2})$', time_str.strip())
    if not match:
        raise ValueError(f"Formato non valido: '{time_str}'. Usa mm:ss (es: 05:30)")
    
    minutes, seconds = int(match.group(1)), int(match.group(2))
    return minutes * 60 + seconds


def seconds_to_time(seconds: float) -> str:
    """Converte secondi al formato mm:ss."""
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins}:{secs:02d}"


def main():
    # Crea finestra root (hidden)
    root = tk.Tk()
    root.withdraw()  # Nascondi la finestra principale
    
    # Mostra messaggio iniziale
    messagebox.showinfo(
        "SINCRONIZZATORE VIDEO",
        "Inserisci i timestamp della partita nel formato mm:ss\n\nEsempio: 05:30"
    )
    
    # Input primo tempo
    while True:
        first_half_input = simpledialog.askstring(
            "Primo Tempo",
            "Inizio PRIMO TEMPO (formato mm:ss)\n\nEsempio: 05:30"
        )
        
        if first_half_input is None:  # Annulla
            root.destroy()
            return
        
        try:
            first_half_seconds = time_to_seconds(first_half_input)
            break
        except ValueError as e:
            messagebox.showerror("Errore", f"Formato non valido!\n\n{e}")
    
    # Input secondo tempo
    while True:
        second_half_input = simpledialog.askstring(
            "Secondo Tempo",
            "Inizio SECONDO TEMPO (formato mm:ss)\n\nEsempio: 52:15"
        )
        
        if second_half_input is None:  # Annulla
            root.destroy()
            return
        
        try:
            second_half_seconds = time_to_seconds(second_half_input)
            break
        except ValueError as e:
            messagebox.showerror("Errore", f"Formato non valido!\n\n{e}")
    
    # Calcola durata
    duration = second_half_seconds - first_half_seconds
    
    # Crea struttura dati
    sync_data = {
        "video_file": "Isuzu UTE A-League 2024-25 - Round 6 - Auckland FC v Newcastle Jets.mp4",
        "sync_points": {
            "first_half_start": first_half_seconds,
            "second_half_start": second_half_seconds,
            "first_half_duration": duration
        },
        "input_format": "mm:ss",
        "timestamps": {
            "first_half_start_display": first_half_input,
            "second_half_start_display": second_half_input
        }
    }
    
    # Salva file
    output_file = Path(__file__).parent.parent / "public" / "data" / "video_sync.json"
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_file, 'w') as f:
        json.dump(sync_data, f, indent=2)
    
    # Mostra messaggio di successo
    result_message = f"""✅ Sincronizzazione completata!

Primo tempo: {first_half_input} ({first_half_seconds} sec)
Secondo tempo: {second_half_input} ({second_half_seconds} sec)
Durata primo tempo: {seconds_to_time(duration)}

📁 File salvato in:
{output_file}
"""
    
    messagebox.showinfo("Successo", result_message)
    root.destroy()


if __name__ == "__main__":
    main()
