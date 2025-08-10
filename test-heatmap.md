# Heatmap Position Tracking Test Guide

## Overview

This guide helps you test the new heatmap position tracking feature that shows where players spend most of their time on the court.

## Prerequisites

1. A video with a player on a badminton/tennis court
2. The video should show the full court from a fixed camera angle

## Testing Steps

### 1. Load Video

- Open the application
- Load a video file with court footage

### 2. Enable Pose Detection

- Click the pose detection button (human figure icon) in the video controls
- Wait for pose detection to initialize
- Verify that skeleton overlay appears on the player

### 3. Calibrate Camera

- Click the calibration button (grid icon) that appears after pose detection is enabled
- Click on the 4 corners of the court in the video:
  1. Near left corner
  2. Near right corner
  3. Far right corner
  4. Far left corner
- Confirm calibration when prompted
- The calibration button should show as "calibrated" (highlighted)

### 4. Start Position Tracking

- After calibration, a new heatmap button should appear (grid with colored squares)
- Click the heatmap button to start position tracking
- A minimap should appear in the bottom-right corner showing:
  - Top-down view of the court
  - Current player position (white dot with pulse animation)
  - Court lines overlay

### 5. Play Video and Track Movement

- Play the video for at least 30 seconds
- Watch the minimap update with the player's position
- The heatmap will gradually build up showing areas where the player spends more time

### 6. View Heatmap Statistics

- The minimap shows:
  - Total distance traveled
  - Average speed
  - Most visited zone
  - Number of position samples collected
- Click the expand button on the minimap to see more options:
  - Color scheme selection (Heat, Cool, Rainbow, Grayscale)
  - Opacity adjustment
  - Toggle current position indicator
  - Toggle statistics display

### 7. Toggle Heatmap Display

- Click the heatmap button again to toggle tracking on/off
- Click the X button on the minimap to hide it
- The heatmap data persists until you start a new tracking session

## Expected Results

### Position Accuracy

- The player's position on the minimap should correspond to their actual position on the court
- The tracking point (hip center) should follow the player smoothly
- Court boundaries should be respected

### Heatmap Visualization

- Areas where the player spends more time should show "hotter" colors (red/yellow in heat mode)
- Areas rarely visited should show "cooler" colors (blue/transparent)
- The heatmap should gradually build up over time

### Performance

- Video playback should remain smooth with heatmap tracking enabled
- Position updates should happen in real-time without lag
- The minimap should update at least 10 times per second

## Troubleshooting

### No Heatmap Button

- Ensure pose detection is enabled first
- Ensure camera calibration is completed
- Check browser console for errors

### Position Not Tracking

- Verify pose detection is working (skeleton visible)
- Check that calibration was successful
- Ensure the player's hips are visible in the frame

### Incorrect Position

- Recalibrate the camera with more accurate corner points
- Ensure the court corners are clicked in the correct order
- Check that the court dimensions are set correctly (default: badminton court)

### Performance Issues

- Try reducing the video quality/resolution
- Close other browser tabs
- Check CPU/GPU usage in task manager

## Technical Details

### How It Works

1. **Pose Detection**: MediaPipe detects player skeleton landmarks
2. **Camera Calibration**: Homography transformation maps 2D video points to 3D court coordinates
3. **Position Tracking**: Hip center position is tracked and transformed to world coordinates
4. **Heatmap Generation**: Position samples are accumulated in a grid and visualized with color intensity
5. **Statistics**: Distance, speed, and zone occupancy are calculated in real-time

### Configuration

The system uses these default settings:

- Court dimensions: 13.4m x 6.1m (badminton)
- Grid resolution: 4 cells per meter (25cm resolution)
- Minimum pose confidence: 70%
- Sample rate: 10 Hz
- Smoothing radius: 1 cell

## Notes

- The accuracy depends heavily on good camera calibration
- Works best with fixed camera angles showing the entire court
- Player occlusion may cause temporary tracking loss
- Multiple players are not currently supported (tracks first detected player only)
