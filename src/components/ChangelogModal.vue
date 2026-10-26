<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click="closeModal"
  >
    <div
      ref="dialogPanel"
      role="dialog"
      aria-modal="true"
      aria-label="Changelog"
      class="flex max-h-[85vh] w-full max-w-lg flex-col rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
      @click.stop
    >
      <!-- Modal Header -->
      <div
        class="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10"
      >
        <h2 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
          Changelog
        </h2>
        <button
          type="button"
          aria-label="Close"
          class="rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          @click="closeModal"
        >
          <svg
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M18 6 6 18M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Modal Content (Scrollable). Versions read as a list of releases, not
           as blue-ruled blocks: the mono version token carries the heading. -->
      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div class="space-y-6">
          <div
            v-for="(entry, index) in changelogEntries"
            :key="index"
          >
            <div class="flex items-baseline gap-2">
              <h3 class="font-mono text-[11px] tracking-wider text-gray-900 dark:text-white">
                {{ entry.version }}
              </h3>
              <span class="font-mono text-[10px] tracking-wider text-gray-500 dark:text-gray-500">
                {{ entry.date }}
              </span>
            </div>
            <ul class="mt-2 space-y-1">
              <li
                v-for="(change, cIndex) in entry.changes"
                :key="cIndex"
                class="flex gap-2 text-[12px] leading-relaxed text-gray-700 dark:text-gray-300"
              >
                <span class="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gray-400 dark:bg-gray-600" />
                <span>{{ change }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div
        class="flex shrink-0 items-center justify-end border-t border-gray-200 px-4 py-3 dark:border-white/10"
      >
        <button
          type="button"
          class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
          @click="closeModal"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useEscapeToClose } from '../composables/useEscapeToClose';
import { useFocusTrap } from '../composables/useFocusTrap';

// Props
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false,
  },
});

// Emits
const emit = defineEmits(['close']);

// Methods
const closeModal = () => {
  emit('close');
};

const dialogPanel = ref<HTMLElement | null>(null);
useFocusTrap(dialogPanel, () => props.isVisible);

useEscapeToClose(() => props.isVisible, closeModal);

// --- MANUAL CHANGELOG ENTRIES ---
// Add new entries to the TOP of this array
const changelogEntries = ref([
  {
    version: 'Beta v3.34',
    date: 'October 26, 2026',
    changes: [
      'A free kick banner on the 2D replay: it fades in over the pitch on a free kick and stays while the broadcast cuts away, until play is back',
      'The video no longer freezes after jumping back to the same moment several times, and plays through to the end of the match',
      'The 2D replay keeps working past 15 minutes, and no longer pauses every 30 seconds while it loads on slower connections',
      'Both players now retry a download that stalls or fails for a moment instead of freezing or stopping',
    ],
  },
  {
    version: 'Beta v3.33',
    date: 'October 25, 2026',
    changes: [
      'The red and blue Attacking / Defending team labels are back above the 2D replay, with their own entry in the layers menu, alongside the attack animation',
    ],
  },
  {
    version: 'Beta v3.32',
    date: 'October 25, 2026',
    changes: [
      'Throw-ins are no longer marked in the 2D replay: the pulsing ring on the touchline is gone, and the Throw-in layer with it',
    ],
  },
  {
    version: 'Beta v3.31',
    date: 'October 25, 2026',
    changes: [
      'When an attack reaches the other team\'s half in the 2D replay, it is shown for 2 seconds as on a match summary: the pitch shaded up to a toothed edge pointing at the goal, the team\'s name over "Attack", the players faded out and the ball held in place with a pulsing border, while play carries on underneath',
      'The Attacking / Defending labels above the pitch, the team-colour attack shading and the attack arrows are gone, and the pitch is a little bigger',
      'Throw-ins no longer zoom in: a ring pulses on the touchline spot instead',
    ],
  },
  {
    version: 'Beta v3.30',
    date: 'October 25, 2026',
    changes: [
      'The ball trail in the 2D replay is 30% shorter, showing the last 2.1 seconds of the ball\'s path',
    ],
  },
  {
    version: 'Beta v3.29',
    date: 'October 25, 2026',
    changes: [
      'The 2D replay draws the red and blue players in brighter colours',
      'Officials, the referee and the linesmen, are drawn in black instead of magenta',
    ],
  },
  {
    version: 'Beta v3.28',
    date: 'October 24, 2026',
    changes: [
      'The 2D replay has a new pitch: the grass is lit from the centre, the playing area is a shade darker, and the lines are thicker with a rounded outer box',
      'Every pitch marking is now drawn solid, including the centre circle and penalty spots, which the pipeline data does not measure and are drawn at their standard sizes',
      'The goals are drawn as boxes behind the goal line, in place of the netting and posts. A net still bulges and lights up when a goal goes in',
    ],
  },
  {
    version: 'Beta v3.27',
    date: 'October 23, 2026',
    changes: [
      'The ball on the 2D replay is drawn as a football, and rolls the way it moves during playback. It still grows and turns cyan the higher it is in the air',
      'Players and the ball are drawn bigger. The player with the ball is drawn a little bigger again, with their shirt number shown only on them',
      'When a player receives the ball, their circle and shirt number are drawn over it for a moment, then fade to show the ball again. Where the data has no shirt number for them, only the circle shows',
      'The gold ring on the player with the ball now fades in quickly, so it shows even when the data marks who has the ball for only a few frames',
      'The ball trail now shows the last 3 seconds of the ball\'s path, rather than 6',
    ],
  },
  {
    version: 'Beta v3.26',
    date: 'October 22, 2026',
    changes: [
      'The 2D replay draws the ball\'s trail: the path it took over the last 6 seconds, fading with age, with a dot wherever it changed direction. It follows the tracked ball itself, so passes, dribbles and loose balls all show, and a line never moves once drawn. Where the ball was lost or its tracking jumped, the trail breaks rather than drawing a line across. Shown or hidden from the Layers menu as Ball trail',
      'Players on the 2D replay are no longer labelled with the tracker\'s four-digit id; shirt numbers stay',
    ],
  },
  {
    version: 'Beta v3.25',
    date: 'October 21, 2026',
    changes: [
      'A Layers menu on the 2D replay shows or hides each visual added on top of the data: the goal and throw-in animations, the attack shading and arrows, the attacking and defending labels, the rings near the ball, the fading of distant players and smooth ring changes. Your choice is remembered in this browser',
      'Throw-in and goal animations now recognise the labels in the current pipeline output, so throw-ins play on this match',
    ],
  },
  {
    version: 'Beta v3.24',
    date: 'October 21, 2026',
    changes: [
      'Throw-ins on the 2D replay: the view zooms in on the spot on the touchline where the throw-in is taken, with a pulsing ring, and eases back out once play is back on. It stays zoomed in while the broadcast cuts away',
    ],
  },
  {
    version: 'Beta v3.23',
    date: 'October 21, 2026',
    changes: [
      'The yellow ring on the player with the ball fades in and out too, instead of blinking',
      'Both rings on the 2D replay fade a little more slowly',
    ],
  },
  {
    version: 'Beta v3.22',
    date: 'October 21, 2026',
    changes: [
      'The 2D replay uses much less processing power while it plays, so it runs more smoothly on slower computers',
      'Players far from the ball are faded further, so the play around the ball stands out more',
      'The white rings on the players near the ball fade in and out instead of switching on and off',
    ],
  },
  {
    version: 'Beta v3.21',
    date: 'October 20, 2026',
    changes: [
      'The attacking and defending labels above the 2D replay show the team names from the match title, such as Manchester City and PSG, instead of Red and Blue',
    ],
  },
  {
    version: 'Beta v3.20',
    date: 'October 20, 2026',
    changes: [
      'The Pipeline output replay loads and seeks much faster on long matches, and draws sharply on high-resolution screens',
      'Fixed colours on the 2D replay: home team red, away team blue, goalkeepers yellow and officials magenta',
      'Players far from the ball are faded, and teammates close to the ball carrier are ringed in white',
      'Attacking and defending labels above the pitch, worked out from possession: a team counts as attacking once it has kept the ball for 3 seconds',
      'While a team attacks, the pitch is shaded from its most advanced player to the goal it attacks, with arrows flowing toward that goal',
      'A GOAL label in the pipeline output plays a goal animation that zooms in on the goal',
    ],
  },
  {
    version: 'Beta v3.19',
    date: 'October 19, 2026',
    changes: [
      'Filter the editor\'s annotations by individual labels: the filter icon beside the group pills opens a checklist of the labels in this video. Tick several to see annotations with any of them',
      'The timeline shows only the annotations the filter keeps, and every marker again under All',
      'Labels without a group, such as Review Needed, can now be filtered on under OTHER',
    ],
  },
  {
    version: 'Beta v3.18',
    date: 'October 17, 2026',
    changes: [
      'The DALF game ID moved off the dashboard rows and into the details panel that opens when you click a video, next to its annotation and comment counts',
    ],
  },
  {
    version: 'Beta v3.17',
    date: 'October 17, 2026',
    changes: [
      'Videos opened from DALF show their DALF game ID on the dashboard, after the comment count, so a video can be matched back to its game',
    ],
  },
  {
    version: 'Beta v3.16',
    date: 'October 16, 2026',
    changes: [
      'Sort the dashboard by match date as well as by last opened. Videos opened from DALF carry their match date; the rest follow, in last-opened order. The choice is remembered',
    ],
  },
  {
    version: 'Beta v3.15',
    date: 'October 16, 2026',
    changes: [
      'The whole video library is shared with the team: every signed-in teammate can see, annotate, comment on, rename and delete every video, including uploads that used to be private. Comparisons stay private to whoever made them',
      'Delete a video from its details panel on the dashboard. The confirmation says how many annotations and comments go with it, and warns when comparisons using the video will be deleted too',
    ],
  },
  {
    version: 'Beta v3.14',
    date: 'October 16, 2026',
    changes: [
      'QA status is now Unreviewed, In review, Failed or Complete. Staging and Production are gone, and videos that had either are now Complete',
      'Videos opened from DALF are named after the match, for example "Manchester City vs PSG - Champions League - 14/10/2026", instead of "Pipeline Output" and a number. Videos still carrying that default name are renamed the next time they are opened from DALF; names someone chose are never changed',
    ],
  },
  {
    version: 'Beta v3.13',
    date: 'October 15, 2026',
    changes: [
      'Label without the mouse: step to a moment with the arrow keys, press Enter to open the label picker above the playhead, then pick a category and a label by letter. In a comparison it labels the selected video',
      'Annotations made by teammates now appear, change and disappear live, in single videos and in comparisons, without reloading',
      'Watch progress is no longer lost, or counted against the wrong video, when you switch to another video in the editor',
      'Team watch coverage on the dashboard no longer reads 0% for every video in a large library',
      'Folder actions (new subfolder, rename, delete) can now be reached on a touch screen and with the keyboard',
      'A label that fails to save now says why inside the label form instead of behind it',
    ],
  },
  {
    version: 'Beta v3.12',
    date: 'September 20, 2026',
    changes: [
      'Comparison view on a phone: both videos are visible again. The two timelines used to take all the space and leave the videos with none',
      'Comparison view: holding an arrow key steps one frame per repeat instead of getting stuck after the first frame',
      'Comparison view: going straight from one comparison to another no longer leaves play, stepping and the timelines unresponsive',
      'Comparison annotations show and sort by their real position on video A. Older ones that read 0:00 now show the right time',
      'Opening a link to a video or comparison you cannot see says so and returns to the dashboard instead of showing "Loading video..." forever',
      'Adding a video no longer risks a duplicate in the library when the check for an existing copy fails',
    ],
  },
  {
    version: 'Beta v3.11',
    date: 'September 20, 2026',
    changes: [
      'Comparison view: you can now draw on video B as well as video A, and drawings appear at the right moment on videos that are not 30 fps',
      'Comparison view: an arrow key steps the selected video by exactly one frame, and the step buttons keep the offset you lined the two videos up with',
      'Comparison view: right-clicking to annotate saves the real position instead of 0:00',
      'Drawings stay on the same part of the picture whatever the window size or layout, including drawings made before this release',
      'Strokes you are still drawing no longer vanish when a teammate adds or edits an annotation',
      'Pipeline output tab: saved drawings show up again, the space bar and arrow keys control the replay instead of the hidden video, and drawing pauses the replay',
      'The timeline stays on screen on videos with many annotations instead of being pushed below the fold',
      'The dashboard and the editor now work on a phone: folders sit above the list, and the video sits above the annotations',
      'Annotations load even when the video itself fails to load, and the editor no longer loads them twice',
      'Deleting an annotation asks for confirmation first, since it also removes its drawing and comments',
      'A comment that fails to save keeps its text, and a failed label change no longer wipes the labels that were already there',
      'Saves that the server refuses now say so: deleting, sharing, revoking a link, changing labels and editing labels no longer fail silently',
      'Sharing a video you do not own explains why it cannot be shared instead of handing out a link that does not work',
      'After signing in you land on the page you were trying to open, including share links, instead of the dashboard',
      'Going back to the dashboard works after opening a share link or a pipeline link',
      'Pipeline videos show their real length in the library once someone has played them, so watch coverage is no longer 100% after the first second',
      'Dashboard counts and label filters stay correct in large libraries, and a failed load says so with a retry instead of showing an empty library',
      'Keyboard and screen reader support: dashboard rows, folder rows and annotation card buttons work from the keyboard, dialogs close with Escape and keep focus inside, and icon buttons are labelled',
      'New comparison: uploads can be cancelled, the file size and type limits are enforced on the server, AVI is no longer offered because browsers cannot play it, and HEVC phone recordings are recognised before uploading',
      'Faster editor loading: comment counts arrive with the annotations instead of one request per annotation',
      'A failed video shows a Try Again button that works, a pipeline video keeps its place if its link has to be refreshed, and a broken video stops retrying forever',
    ],
  },
  {
    version: 'Beta v3.10',
    date: 'September 7, 2026',
    changes: [
      'Pipeline videos start playing straight away in Chrome instead of loading for minutes: the player now streams them fragment by fragment, and seeking anywhere in a two-hour video takes under a second',
      'Share links now open with both the Video and Pipeline output tabs, each listing its own annotations',
      'New comparison: upload a video file straight from the picker for either side, so a comparison no longer depends on the pipeline having processed both videos',
      'Comparison view: clicking either timeline opens the label picker, the same as for a single video',
      'Comparison view: annotations now show as markers on both timelines, each at its own video\'s frame',
      'Teammates can annotate each other\'s pipeline outputs; the sidebar no longer shows them as view only',
      'Pipeline output tab: replay the 2D pitch output of an AWS pipeline video with transport controls and timeline scrubbing, and keep its annotations and drawings separate from the video\'s',
      'Pipeline outputs are visible to the whole team, who can annotate and comment on them, instead of only to whoever opened them first',
      'Rename a video from the dashboard row or the details panel; renames show up in the video history',
      'History tab in the editor sidebar: who annotated, commented, renamed or changed status on the video, and when',
      'QA status per video: set it from the dashboard row, the details panel or the editor rail, and filter the dashboard by it',
      'Faster annotating: left-click the timeline or right-click the video for a keyboard quick pick, with comment and drawing modes, undo while drawing, and distinct timeline markers for comments and drawings',
      'Any signed-in user who can see a video can annotate it, and a comment is no longer required on an annotation',
      'Folders are a shared team workspace: everyone sees every folder and can file videos into them',
      'Dashboard ordered by the projects you opened most recently, with when you last opened each one in the meta line',
      'Skeleton loaders while the library and folders load, and the list paints in its final order and folder from the first frame',
      'Local video upload has been removed; videos arrive from the pipeline',
      'Security: pipeline videos are fetched through a proxy that checks the caller can see the video, and every table is now covered by row-level security',
    ],
  },
  {
    version: 'Beta v3.9',
    date: 'July 9, 2026',
    changes: [
      'New video library: browse all shared videos with search, All/My Videos scope toggle, and pagination',
      'Organize videos into folders with drag & drop filing and folder filtering',
      'Video details sidebar: preview annotations, jump straight to their timestamps, and see per-video stats',
      'Watch progress tracking: see how much of each video you and your team have watched',
      'Filter videos by annotation labels via the new Filter button next to the search bar',
      'New football-tracking QA label set (EVT/PITCH/TEAM/NPL/PLR/PLY/BALL) with descriptions shown in tooltips',
      'Thumbnails for AWS pipeline videos',
      'Click the Perspecto title to return to the library',
      'Security: database access is now protected with row-level security policies',
    ],
  },
  {
    version: 'Beta v3.8',
    date: 'March 13, 2026',
    changes: [
      'Major codebase refactor for improved performance and maintainability',
      'Fix frame number not updating when scrubbing AWS pipeline videos',
      'Fix drawing annotations not saving when added to an annotation',
      'Fix frame counter showing -1 and not updating until video is played',
      'Fix silent error swallowing in drawing canvas and comment handlers',
      'Fix memory leaks in dual video player and comment subscriptions',
      'Consolidate video state into single source of truth',
      'Standardize error handling across all services',
    ],
  },
  {
    version: 'Beta v3.7',
    date: 'March 12, 2026',
    changes: [
      'Load pipeline output videos directly via shared link',
      'Automatic presigned URL refresh for streamed videos',
    ],
  },
    {
    version: 'Beta v3.6',
    date: 'February 25, 2026',
    changes: [
      'Hide comment functionality in view-only mode'
    ],
  },
  {
    version: 'Beta v3.5',
    date: 'February 23, 2026',
    changes: [
      'Make skeleton loader work for both light and dark mode'
    ],
  },
   {
    version: 'Beta v3.4',
    date: 'February 17, 2026',
    changes: [
      'Add frame increase/decrease using arrow keys',
      'Use spacebar to play/pause video',
      'Fix drawing annotation persistence'
    ],
  },
  {
    version: 'Beta v3.3',
    date: 'February 8, 2026',
    changes: [
      'Added dark mode toggle',
    ],
  },
  {
    version: 'Beta v3.2',
    date: 'February 7, 2026',
    changes: [
      'Removed all video analytics functionality',
    ],
  },
  {
    version: 'Beta v3.1',
    date: 'January 27, 2026',
    changes: [
      'Fixed video scrubbing performance',
    ],
  },
  {
    version: 'Beta v3',
    date: 'January 26, 2026',
    changes: [
      'Added Changelog modal',
      'Implemented Keycloak Authentication',
      'Updated to Montserrat font',
      'Improved video scrubbing performance',
      'Major refactor to clean-up components'
    ],
  },
]);
</script>
