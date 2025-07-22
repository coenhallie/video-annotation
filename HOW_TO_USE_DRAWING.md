# How to Use Drawing in Your Main App

## ✅ Integration Complete!

The drawing functionality is now integrated into your main video annotation app. Here's how to use it:

## 🎯 How to Activate Drawing

### Step 1: Load a Video

1. Start your app: `npm run dev`
2. Sign in to your account
3. Load a video using the URL input field in the header

### Step 2: Access Drawing Tools

Once your video is loaded, you'll see the **Drawing Tools panel** in the right sidebar, above your annotation panel.

### Step 3: Start Drawing

1. **Click "Start Drawing"** in the Drawing Tools panel
2. The canvas will become active (you'll see a crosshair cursor over the video)
3. **Select your tool:**
   - **Pen:** Draw new annotations
   - **Eraser:** Remove existing drawings

### Step 4: Customize Your Drawing

- **Stroke Width:** Use the slider to adjust thickness (1-20px)
- **Severity Level:** Choose color-coded severity:
  - 🟢 **Low (Green):** Minor notes
  - 🟡 **Medium (Amber):** Moderate issues
  - 🔴 **High (Red):** Critical problems

### Step 5: Draw on Video

- **Click and drag** on the video to draw
- Drawings are automatically saved to the current frame
- Navigate between frames to see frame-specific drawings

## 🎮 Controls

### Drawing Tools Panel Features:

- **Start/Exit Drawing:** Toggle drawing mode on/off
- **Tool Selection:** Switch between pen and eraser
- **Stroke Width Slider:** Adjust line thickness
- **Severity Buttons:** Choose annotation importance level
- **Clear Frame:** Remove all drawings from current frame
- **Clear All:** Remove all drawings from entire video
- **Statistics:** See drawing counts per frame and total
- **Frame Navigation:** Click frame numbers to jump to frames with drawings

### Video Controls:

- **Normal Mode:** Video behaves as usual (play, pause, seek)
- **Drawing Mode:** Video pauses when you start drawing, resumes when you exit drawing mode

## 🔄 Integration with Annotations

Drawings are automatically converted to annotations and appear in your annotation panel:

- Each drawing becomes a "Drawing Annotation"
- Drawings are color-coded by severity level
- They appear in the timeline alongside text annotations
- You can click on drawing annotations to jump to that frame

## 📍 What's Changed in Your App

### New Components Added:

- **Drawing Tools Panel:** Added above your annotation panel
- **Drawing Canvas:** Invisible overlay on your video player
- **Drawing functionality:** Integrated with your existing annotation system

### Your Existing Features Still Work:

- ✅ All your current video annotation features
- ✅ Timeline navigation
- ✅ Text annotations
- ✅ Real-time collaboration
- ✅ Video sharing
- ✅ User authentication

## 🎨 Drawing Workflow Example

1. **Load your video** (same as before)
2. **Navigate to the frame** where you want to draw
3. **Click "Start Drawing"** in the tools panel
4. **Select pen tool and medium severity** (amber color)
5. **Draw on the video** to highlight an issue
6. **Click "Exit Drawing"** when done
7. **Your drawing is now saved** and appears as an annotation
8. **Navigate to other frames** and repeat as needed

## 🔧 Troubleshooting

**Drawing canvas not appearing?**

- Make sure a video is loaded and playing
- Check that the video has finished loading (duration > 0)

**Can't draw on video?**

- Ensure "Start Drawing" is clicked (button should show "Exit Drawing")
- Check that you're not in demo mode

**Drawings not saving?**

- Drawings are automatically saved when you create them
- They should appear in your annotation panel immediately

## 🎯 Pro Tips

1. **Use different severity levels** for different types of issues
2. **Navigate frame by frame** for precise drawing placement
3. **Use the frame navigation buttons** in the drawing tools to quickly jump between frames with drawings
4. **Clear individual frames** if you make mistakes, rather than clearing everything
5. **Drawings work with your existing timeline** - you can seek to drawing annotations just like text annotations

## 🚀 Next Steps

- **Try drawing on different frames** to see how frame-based storage works
- **Experiment with different tools and severity levels**
- **Test the integration with your existing annotation workflow**
- **Share videos with drawings** to see how they appear to other users

The drawing functionality is now fully integrated into your main app and works alongside all your existing features!
