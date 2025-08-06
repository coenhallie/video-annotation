<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click="closeModal"
  >
    <div
      class="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden"
      @click.stop
    >
      <!-- Modal Header with Tabs -->
      <div class="border-b border-gray-200">
        <div class="flex items-center justify-between p-6 pb-0">
          <h2 class="text-xl font-semibold text-gray-900">
            {{ getModalTitle() }}
          </h2>
          <button
            class="text-gray-400 hover:text-gray-600 transition-colors"
            @click="closeModal"
          >
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <!-- Tab Navigation -->
        <div class="flex space-x-8 px-6">
          <button
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              activeTab === 'load'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ]"
            @click="setActiveTab('load')"
          >
            Load Project
          </button>
          <button
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              activeTab === 'load-video'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ]"
            @click="setActiveTab('load-video')"
          >
            Upload Video
          </button>
          <button
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              activeTab === 'create'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ]"
            @click="setActiveTab('create')"
          >
            Create Comparison
          </button>
        </div>
      </div>

      <!-- Modal Content -->
      <div class="p-6 overflow-y-auto max-h-[70vh]">
        <!-- Load Video Tab (Combined Upload and URL) -->
        <div v-if="activeTab === 'load-video'">
          <div class="space-y-6">
            <!-- URL Input Section -->
            <div>
              <h3 class="text-lg font-medium text-gray-900 mb-4">
                Load from URL
              </h3>
              <div class="space-y-4">
                <div>
                  <label
                    for="video-url"
                    class="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Video URL
                  </label>
                  <div class="relative">
                    <input
                      id="video-url"
                      v-model="urlInput"
                      type="url"
                      placeholder="Enter MP4 video URL..."
                      class="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      @keypress="handleUrlKeyPress"
                    />
                    <button
                      :disabled="!urlInput.trim() || isLoadingUrl"
                      class="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Load video"
                      @click="loadVideoFromUrl"
                    >
                      <div
                        v-if="isLoadingUrl"
                        class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"
                      />
                      <svg
                        v-else
                        class="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m6-10V4a2 2 0 00-2-2H5a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2V4z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- URL Loading Error -->
                <div
                  v-if="urlError"
                  class="p-3 bg-red-50 border border-red-200 rounded-md"
                >
                  <p class="text-sm text-red-600">
                    {{ urlError }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Divider -->
            <div class="relative">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-gray-300" />
              </div>
              <div class="relative flex justify-center text-sm">
                <span class="px-2 bg-white text-gray-500">OR</span>
              </div>
            </div>

            <!-- Upload Local File Section -->
            <div>
              <h3 class="text-lg font-medium text-gray-900 mb-4">
                Upload Local File
              </h3>
              <VideoUpload
                @upload-success="handleVideoUploadSuccess"
                @upload-error="handleVideoUploadError"
              />
            </div>
          </div>
        </div>

        <!-- Load Project Tab -->
        <div v-else-if="activeTab === 'load'">
          <!-- Loading State -->
          <div v-if="isLoading" class="flex items-center justify-center py-12">
            <div
              class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"
            />
            <span class="ml-3 text-gray-600">Loading your projects...</span>
          </div>

          <!-- Error State -->
          <div v-else-if="error" class="text-center py-12">
            <div class="text-red-600 mb-2">
              <svg
                class="w-12 h-12 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <p class="text-gray-600">
              {{ error }}
            </p>
            <button
              class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              @click="loadProjects"
            >
              Try Again
            </button>
          </div>

          <!-- Empty State -->
          <div v-else-if="projects.length === 0" class="text-center py-12">
            <div class="text-gray-400 mb-4">
              <svg
                class="w-16 h-16 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">
              No projects found
            </h3>
            <p class="text-gray-600">
              You haven't created any projects yet. Go to Upload Video to get
              started!
            </p>
          </div>

          <!-- Projects List -->
          <div v-else class="space-y-4">
            <div
              v-for="project in projects"
              :key="project.id"
              class="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
              @click="selectProject(project)"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-2">
                    <h3 class="font-medium text-gray-900">
                      {{ project.title }}
                    </h3>
                    <!-- Project Type Indicator -->
                    <span
                      v-if="project.projectType === 'single'"
                      class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      Single Video
                    </span>
                    <span
                      v-else
                      class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800"
                    >
                      <svg
                        class="w-3 h-3 mr-1"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                        />
                      </svg>
                      Dual Video
                    </span>
                    <!-- Comment Count Indicator -->
                    <span
                      v-if="commentCounts[project.id] !== undefined"
                      class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                      :title="`${commentCounts[project.id]} comment${
                        commentCounts[project.id] !== 1 ? 's' : ''
                      }`"
                    >
                      <svg
                        class="w-3 h-3 mr-1"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      {{ commentCounts[project.id] || 0 }}
                    </span>
                    <!-- New Comment Indicator -->
                    <div
                      v-if="newCommentIndicators.has(project.id)"
                      class="relative inline-flex items-center"
                    >
                      <span
                        class="inline-flex items-center justify-center w-3 h-3 bg-red-500 rounded-full animate-pulse"
                        title="New comments available"
                      >
                        <span class="sr-only">New comments</span>
                      </span>
                    </div>
                  </div>

                  <!-- Single Video Project Details -->
                  <div
                    v-if="project.projectType === 'single'"
                    class="text-sm text-gray-600 space-y-1"
                  >
                    <div class="flex items-center space-x-4">
                      <span>
                        <span class="font-medium">Duration:</span>
                        {{ formatDuration(project.video.duration) }}
                      </span>
                      <span>
                        <span class="font-medium">FPS:</span>
                        {{
                          project.video.fps && parseFloat(project.video.fps) > 0
                            ? project.video.fps
                            : 'Detecting...'
                        }}
                      </span>
                    </div>
                    <div class="flex items-center space-x-4">
                      <span>
                        <span class="font-medium">Created:</span>
                        {{ formatDate(project.createdAt) }}
                      </span>
                    </div>
                  </div>

                  <!-- Dual Video Project Details -->
                  <div v-else class="text-sm text-gray-600 space-y-2">
                    <div class="grid grid-cols-2 gap-4">
                      <div class="space-y-1">
                        <p class="font-medium text-gray-700">Video A:</p>
                        <p class="truncate">
                          {{ project.videoA?.title || 'Unknown Video' }}
                        </p>
                        <p class="text-xs text-gray-500">
                          {{ formatDuration(project.videoA?.duration || 0) }} •
                          {{
                            project.videoA?.fps &&
                            parseFloat(project.videoA.fps) > 0
                              ? project.videoA.fps
                              : 'Detecting...'
                          }}
                          FPS
                        </p>
                      </div>
                      <div class="space-y-1">
                        <p class="font-medium text-gray-700">Video B:</p>
                        <p class="truncate">
                          {{ project.videoB?.title || 'Unknown Video' }}
                        </p>
                        <p class="text-xs text-gray-500">
                          {{ formatDuration(project.videoB?.duration || 0) }} •
                          {{
                            project.videoB?.fps &&
                            parseFloat(project.videoB.fps) > 0
                              ? project.videoB.fps
                              : 'Detecting...'
                          }}
                          FPS
                        </p>
                      </div>
                    </div>
                    <div class="flex items-center space-x-4 pt-1">
                      <span>
                        <span class="font-medium">Created:</span>
                        {{ formatDate(project.createdAt) }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Delete Button -->
                <div class="ml-4 flex-shrink-0">
                  <button
                    class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    title="Delete project"
                    @click.stop="confirmDeleteProject(project)"
                  >
                    <svg
                      class="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Create Comparison Tab -->
        <div v-else-if="activeTab === 'create'">
          <!-- Loading State -->
          <div v-if="isLoading" class="flex items-center justify-center py-12">
            <div
              class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"
            />
            <span class="ml-3 text-gray-600">Loading your projects...</span>
          </div>

          <!-- Error State -->
          <div v-else-if="error" class="text-center py-12">
            <div class="text-red-600 mb-2">
              <svg
                class="w-12 h-12 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <p class="text-gray-600">
              {{ error }}
            </p>
            <button
              class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              @click="loadProjects"
            >
              Try Again
            </button>
          </div>

          <!-- Empty State -->
          <div
            v-else-if="singleVideoProjects.length === 0"
            class="text-center py-12"
          >
            <div class="text-gray-400 mb-4">
              <svg
                class="w-16 h-16 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">
              No single video projects found
            </h3>
            <p class="text-gray-600">
              You need at least two single video projects to create a
              comparison.
            </p>
          </div>

          <!-- Comparison Creation Workflow -->
          <div v-else>
            <!-- Progress Indicator -->
            <div class="mb-6">
              <div class="flex items-center">
                <div class="flex items-center text-sm">
                  <span
                    :class="[
                      'flex items-center justify-center w-8 h-8 rounded-full border-2',
                      comparisonState.step === 'select-video-a'
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : comparisonState.selectedVideoA
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-gray-300 text-gray-500',
                    ]"
                  >
                    1
                  </span>
                  <span class="ml-2 font-medium text-gray-900"
                    >Select Video A</span
                  >
                </div>
                <div class="flex-1 mx-4 h-0.5 bg-gray-200">
                  <div
                    :class="[
                      'h-full transition-all duration-300',
                      comparisonState.selectedVideoA
                        ? 'bg-green-500'
                        : 'bg-gray-200',
                    ]"
                  />
                </div>
                <div class="flex items-center text-sm">
                  <span
                    :class="[
                      'flex items-center justify-center w-8 h-8 rounded-full border-2',
                      comparisonState.step === 'select-video-b'
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : comparisonState.selectedVideoB
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-gray-300 text-gray-500',
                    ]"
                  >
                    2
                  </span>
                  <span class="ml-2 font-medium text-gray-900"
                    >Select Video B</span
                  >
                </div>
                <div class="flex-1 mx-4 h-0.5 bg-gray-200">
                  <div
                    :class="[
                      'h-full transition-all duration-300',
                      comparisonState.selectedVideoB
                        ? 'bg-green-500'
                        : 'bg-gray-200',
                    ]"
                  />
                </div>
                <div class="flex items-center text-sm">
                  <span
                    :class="[
                      'flex items-center justify-center w-8 h-8 rounded-full border-2',
                      comparisonState.step === 'details' ||
                      comparisonState.step === 'creating'
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : 'border-gray-300 text-gray-500',
                    ]"
                  >
                    3
                  </span>
                  <span class="ml-2 font-medium text-gray-900">Details</span>
                </div>
              </div>
            </div>

            <!-- Step Content -->
            <!-- Select Video A -->
            <div v-if="comparisonState.step === 'select-video-a'">
              <h3 class="text-lg font-medium text-gray-900 mb-4">
                Select the first video for comparison
              </h3>
              <div class="space-y-3">
                <div
                  v-for="project in availableVideosForA"
                  :key="project.id"
                  class="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                  @click="selectVideoA(project)"
                >
                  <div class="flex items-center gap-3">
                    <div class="flex-1">
                      <h4 class="font-medium text-gray-900">
                        {{ project.title }}
                      </h4>
                      <div class="text-sm text-gray-600 mt-1">
                        Duration: {{ formatDuration(project.video.duration) }} •
                        FPS:
                        {{
                          project.video.fps && parseFloat(project.video.fps) > 0
                            ? project.video.fps
                            : 'Detecting...'
                        }}
                      </div>
                    </div>
                    <span
                      class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      Single Video
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Select Video B -->
            <div v-else-if="comparisonState.step === 'select-video-b'">
              <div class="mb-4">
                <h3 class="text-lg font-medium text-gray-900 mb-2">
                  Select the second video for comparison
                </h3>
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-blue-800"
                      >Video A Selected:</span
                    >
                    <span class="text-sm text-blue-700">{{
                      comparisonState.selectedVideoA.title
                    }}</span>
                  </div>
                </div>
              </div>
              <div class="space-y-3">
                <div
                  v-for="project in availableVideosForB"
                  :key="project.id"
                  class="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                  @click="selectVideoB(project)"
                >
                  <div class="flex items-center gap-3">
                    <div class="flex-1">
                      <h4 class="font-medium text-gray-900">
                        {{ project.title }}
                      </h4>
                      <div class="text-sm text-gray-600 mt-1">
                        Duration: {{ formatDuration(project.video.duration) }} •
                        FPS:
                        {{
                          project.video.fps && parseFloat(project.video.fps) > 0
                            ? project.video.fps
                            : 'Detecting...'
                        }}
                      </div>
                    </div>
                    <span
                      class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      Single Video
                    </span>
                  </div>
                </div>
              </div>
              <div class="mt-4">
                <button
                  class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  @click="goBackInComparison"
                >
                  ← Back to Video A
                </button>
              </div>
            </div>

            <!-- Details -->
            <div v-else-if="comparisonState.step === 'details'">
              <h3 class="text-lg font-medium text-gray-900 mb-4">
                Comparison Details
              </h3>

              <!-- Selected Videos Preview -->
              <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 class="font-medium text-blue-800 mb-2">Video A</h4>
                  <p class="text-sm text-blue-700">
                    {{ comparisonState.selectedVideoA.title }}
                  </p>
                  <p class="text-xs text-blue-600 mt-1">
                    {{
                      formatDuration(
                        comparisonState.selectedVideoA.video.duration
                      )
                    }}
                    •
                    {{
                      comparisonState.selectedVideoA.video.fps &&
                      parseFloat(comparisonState.selectedVideoA.video.fps) > 0
                        ? comparisonState.selectedVideoA.video.fps
                        : 'Detecting...'
                    }}
                    FPS
                  </p>
                </div>
                <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 class="font-medium text-green-800 mb-2">Video B</h4>
                  <p class="text-sm text-green-700">
                    {{ comparisonState.selectedVideoB.title }}
                  </p>
                  <p class="text-xs text-green-600 mt-1">
                    {{
                      formatDuration(
                        comparisonState.selectedVideoB.video.duration
                      )
                    }}
                    •
                    {{
                      comparisonState.selectedVideoB.video.fps &&
                      parseFloat(comparisonState.selectedVideoB.video.fps) > 0
                        ? comparisonState.selectedVideoB.video.fps
                        : 'Detecting...'
                    }}
                    FPS
                  </p>
                </div>
              </div>

              <!-- Form -->
              <div class="space-y-4">
                <div>
                  <label
                    for="comparison-title"
                    class="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Comparison Title *
                  </label>
                  <input
                    id="comparison-title"
                    v-model="comparisonState.title"
                    type="text"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter a title for this comparison"
                    :disabled="comparisonState.isCreating"
                  />
                </div>
                <div>
                  <label
                    for="comparison-description"
                    class="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Description (Optional)
                  </label>
                  <textarea
                    id="comparison-description"
                    v-model="comparisonState.description"
                    rows="3"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Describe what you're comparing..."
                    :disabled="comparisonState.isCreating"
                  />
                </div>
              </div>

              <!-- Error Display -->
              <div
                v-if="comparisonState.error"
                class="mt-4 p-3 bg-red-50 border border-red-200 rounded-md"
              >
                <p class="text-sm text-red-600">
                  {{ comparisonState.error }}
                </p>
              </div>

              <!-- Actions -->
              <div class="flex items-center justify-between mt-6">
                <button
                  :disabled="comparisonState.isCreating"
                  class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                  @click="goBackInComparison"
                >
                  ← Back to Video B
                </button>
                <button
                  :disabled="
                    comparisonState.isCreating || !comparisonState.title.trim()
                  "
                  class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  @click="createComparison"
                >
                  <div
                    v-if="comparisonState.isCreating"
                    class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
                  />
                  {{
                    comparisonState.isCreating
                      ? 'Creating...'
                      : 'Create Comparison'
                  }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div
        class="flex items-center justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50"
      >
        <button
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          @click="closeModal"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <div
      v-if="showDeleteConfirmation"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60"
      @click="cancelDelete"
    >
      <div
        class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        @click.stop
      >
        <div class="flex items-center mb-4">
          <div class="flex-shrink-0">
            <svg
              class="w-6 h-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-lg font-medium text-gray-900">Delete Project</h3>
          </div>
        </div>

        <div class="mb-6">
          <p class="text-sm text-gray-600">
            Are you sure you want to delete "<strong>{{
              projectToDelete?.title
            }}</strong
            >"? This action cannot be undone and will permanently remove the
            project and all its annotations.
          </p>
        </div>

        <div class="flex justify-end space-x-3">
          <button
            :disabled="isDeleting"
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="cancelDelete"
          >
            Cancel
          </button>
          <button
            :disabled="isDeleting"
            class="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="deleteProject"
          >
            <span v-if="isDeleting" class="flex items-center">
              <div
                class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
              />
              Deleting...
            </span>
            <span v-else>Delete Project</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { ProjectService } from '../services/projectService.ts';
import { ComparisonVideoService } from '../services/comparisonVideoService.ts';
import { CommentService } from '../services/commentService.ts';
import { useAuth } from '../composables/useAuth.ts';
import { useGlobalComments } from '../composables/useGlobalComments.ts';
import { useSessionCleanup } from '../composables/useSessionCleanup.ts';
import VideoUpload from './VideoUpload.vue';

// Props
const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false,
  },
});

// Emits
const emit = defineEmits(['close', 'project-selected']);

// Composables
const { user } = useAuth();
const { subscribeToGlobalComments, unsubscribeFromGlobalComments } =
  useGlobalComments();
const { cleanupForProjectSwitch } = useSessionCleanup();

// State
const projects = ref<Project[]>([]);
const isLoading = ref(false);
const error = ref(null);
const commentCounts = ref<Record<string, number>>({});
const newCommentIndicators = ref<Set<string>>(new Set());
const lastViewedTimes = ref<Record<string, string>>({});

// Tab management
const activeTab = ref('load');

// URL loading state
const urlInput = ref('');
const isLoadingUrl = ref(false);
const urlError = ref(null);

// Delete confirmation state
const showDeleteConfirmation = ref(false);
const projectToDelete = ref(null);
const isDeleting = ref(false);

// Computed properties
const singleVideoProjects = computed<SingleProject[]>(() =>
  projects.value.filter(
    (project): project is SingleProject => project.projectType === 'single'
  )
);

// Methods
const closeModal = () => {
  // Reset tab to load project when closing
  activeTab.value = 'load';
  // Reset comparison state
  resetComparisonState();
  // Reset URL state
  resetUrlState();
  emit('close');
};

const setActiveTab = (tab: 'load' | 'load-video' | 'create') => {
  activeTab.value = tab;
};

const handleComparisonCreated = (comparisonProject: any) => {
  console.log('🎬 [LoadVideoModal] Comparison created:', comparisonProject);
  emit('project-selected', comparisonProject);
  closeModal();
};

const loadProjects = async () => {
  if (!user.value) return;

  // Prevent multiple simultaneous loads
  if (isLoading.value) return;

  isLoading.value = true;
  error.value = null;

  try {
    console.log(
      '🎬 [LoadVideoModal] Loading projects for user:',
      user.value.email
    );

    // Clear projects and comment counts before loading new ones
    projects.value = [];
    commentCounts.value = {};

    // Use ProjectService to get all projects
    const userProjects = await ProjectService.getUserProjects(user.value.id);
    projects.value = userProjects;

    console.log('🎬 [LoadVideoModal] Loaded projects:', projects.value.length);

    // Load comment counts for all projects
    if (userProjects.length > 0) {
      console.log('🎬 [LoadVideoModal] Loading comment counts...');
      const projectIds = userProjects.map((project) => project.id);
      const counts = await CommentService.getCommentCountsForProjects(
        projectIds
      );
      commentCounts.value = counts;
      console.log('🎬 [LoadVideoModal] Loaded comment counts:', counts);

      // Check for new comments since last viewed
      userProjects.forEach((project) => {
        const lastViewed = lastViewedTimes.value[project.id];
        if (lastViewed) {
          // Check if there are any comments newer than last viewed time
          // This would require checking comment timestamps, but for now we'll rely on real-time updates
          console.log(
            `🎬 [LoadVideoModal] Last viewed ${project.title}:`,
            lastViewed
          );
        }
      });
    }
  } catch (err) {
    console.error('❌ [LoadVideoModal] Error loading projects:', err);
    error.value = 'Failed to load projects. Please try again.';
  } finally {
    isLoading.value = false;
  }
};

const selectProject = async (project: Project) => {
  try {
    console.log(
      '🎬 [LoadVideoModal] Project selected:',
      project.title,
      'Type:',
      project.projectType
    );

    // Mark project as viewed (clear new comment indicator)
    markProjectAsViewed(project.id);

    // Note: The actual cleanup will be handled by App.vue's handleProjectSelected
    // This ensures proper coordination between the modal and the main app
    console.log(
      '🔄 [LoadVideoModal] Delegating cleanup to App.vue handleProjectSelected'
    );

    // Emit the project-selected event with the entire project object
    emit('project-selected', project);

    closeModal();
  } catch (err) {
    console.error('❌ [LoadVideoModal] Error selecting project:', err);
    error.value = 'Failed to select project. Please try again.';
  }
};

// New comment indicator methods
const markProjectAsViewed = (projectId: string) => {
  lastViewedTimes.value[projectId] = new Date().toISOString();
  newCommentIndicators.value.delete(projectId);

  // Store in localStorage for persistence
  const viewedTimes = JSON.parse(
    localStorage.getItem('projectViewedTimes') || '{}'
  );
  viewedTimes[projectId] = lastViewedTimes.value[projectId];
  localStorage.setItem('projectViewedTimes', JSON.stringify(viewedTimes));
};

const loadLastViewedTimes = () => {
  const stored = localStorage.getItem('projectViewedTimes');
  if (stored) {
    lastViewedTimes.value = JSON.parse(stored);
  }
};

const handleNewComment = (comment: {
  annotationId: string;
  createdAt: string;
}) => {
  console.log('🔔 [LoadVideoModal] New comment received:', comment);

  // Find which project this comment belongs to
  const project = projects.value.find((p) => {
    if (p.projectType === 'single') {
      return p.annotations?.some((a) => a.id === comment.annotationId);
    } else {
      return p.annotations?.some((a) => a.id === comment.annotationId);
    }
  });

  if (project) {
    const lastViewed = lastViewedTimes.value[project.id];
    const commentTime = new Date(comment.createdAt);

    // Only show indicator if comment is newer than last viewed time
    if (!lastViewed || commentTime > new Date(lastViewed)) {
      newCommentIndicators.value.add(project.id);

      // Update comment count
      commentCounts.value[project.id] =
        (commentCounts.value[project.id] || 0) + 1;
    }
  }
};

const setupRealtimeComments = () => {
  if (subscribeToGlobalComments) {
    subscribeToGlobalComments(handleNewComment);
    console.log('🔔 [LoadVideoModal] Subscribed to global comments');
  }
};

const cleanupRealtimeComments = () => {
  if (unsubscribeFromGlobalComments) {
    unsubscribeFromGlobalComments();
    console.log('🔔 [LoadVideoModal] Unsubscribed from global comments');
  }
};

// Utility functions
const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return (
    date.toLocaleDateString() +
    ' ' +
    date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  );
};

// Delete project methods
const confirmDeleteProject = (project: Project) => {
  projectToDelete.value = project;
  showDeleteConfirmation.value = true;
};

const cancelDelete = () => {
  showDeleteConfirmation.value = false;
  projectToDelete.value = null;
};

const deleteProject = async () => {
  if (!projectToDelete.value) return;

  try {
    isDeleting.value = true;
    console.log(
      '🗑️ [LoadVideoModal] Deleting project:',
      projectToDelete.value.title
    );

    // Delete the project using ProjectService
    await ProjectService.deleteProject(projectToDelete.value);

    // Remove the project from the local projects array
    const index = projects.value.findIndex(
      (p) => p.id === projectToDelete.value.id
    );
    if (index !== -1) {
      projects.value.splice(index, 1);
    }

    console.log('✅ [LoadVideoModal] Project deleted successfully');

    // Close the confirmation dialog
    showDeleteConfirmation.value = false;
    projectToDelete.value = null;
  } catch (error) {
    console.error('❌ [LoadVideoModal] Error deleting project:', error);
    // You could add a toast notification here for better UX
    alert('Failed to delete project. Please try again.');
  } finally {
    isDeleting.value = false;
  }
};

// Watch for modal visibility changes
watch(
  () => props.isVisible,
  (newValue) => {
    if (newValue && user.value) {
      // Only load projects if the array is empty or if it's the first time opening
      if (projects.value.length === 0) {
        loadProjects();
      }
    }
  },
  { immediate: true }
);
// Comparison creation state
const comparisonState = ref({
  step: 'select-video-a', // 'select-video-a' | 'select-video-b' | 'details' | 'creating'
  selectedVideoA: null,
  selectedVideoB: null,
  title: '',
  description: '',
  isCreating: false,
  error: null,
});

// Available videos for comparison creation
const availableVideosForA = computed(() => singleVideoProjects.value);
const availableVideosForB = computed(() =>
  singleVideoProjects.value.filter(
    (project) => project.id !== comparisonState.value.selectedVideoA?.id
  )
);

// Comparison creation methods
const selectVideoA = (project: SingleProject) => {
  comparisonState.value.selectedVideoA = project;
  comparisonState.value.step = 'select-video-b';
};

const selectVideoB = (project: SingleProject) => {
  comparisonState.value.selectedVideoB = project;
  comparisonState.value.step = 'details';
};

const goBackInComparison = () => {
  if (comparisonState.value.step === 'select-video-b') {
    comparisonState.value.step = 'select-video-a';
    comparisonState.value.selectedVideoA = null;
  } else if (comparisonState.value.step === 'details') {
    comparisonState.value.step = 'select-video-b';
    comparisonState.value.selectedVideoB = null;
  }
};

const createComparison = async () => {
  if (!comparisonState.value.title.trim()) {
    comparisonState.value.error = 'Title is required';
    return;
  }
  if (
    !comparisonState.value.selectedVideoA?.video?.id ||
    !comparisonState.value.selectedVideoB?.video?.id
  ) {
    comparisonState.value.error = 'Both videos must be selected';
    return;
  }

  try {
    comparisonState.value.isCreating = true;
    comparisonState.value.error = null;

    // Create comparison using ComparisonVideoService with explicit IDs (flat, camelCase aliases on the service)
    const comparisonVideo = await ComparisonVideoService.createComparisonVideo({
      title: comparisonState.value.title,
      description: comparisonState.value.description ?? null,
      videoAId: comparisonState.value.selectedVideoA.video.id,
      videoBId: comparisonState.value.selectedVideoB.video.id,
      userId:
        user.value && (user.value as any).id ? (user.value as any).id : null,
    });

    // Transform to Project format
    const dualProject = {
      id: comparisonVideo.id,
      projectType: 'dual',
      title: comparisonVideo.title ?? comparisonState.value.title,
      createdAt: comparisonVideo.createdAt ?? new Date().toISOString(),
      videoA:
        comparisonVideo.videoA ?? comparisonState.value.selectedVideoA.video,
      videoB:
        comparisonVideo.videoB ?? comparisonState.value.selectedVideoB.video,
      comparisonVideo,
    };

    handleComparisonCreated(dualProject);
  } catch (error) {
    console.error('❌ [LoadVideoModal] Error creating comparison:', error);
    comparisonState.value.error =
      'Failed to create comparison. Please try again.';
  } finally {
    comparisonState.value.isCreating = false;
  }
};

// Modal title helper
const getModalTitle = () => {
  switch (activeTab.value) {
    case 'load-video':
      return 'Load Video';
    case 'load':
      return 'Select Project';
    case 'create':
      return 'Create Comparison';
    default:
      return 'Load Video';
  }
};

// Video upload handlers
const handleVideoUploadSuccess = (videoRecord) => {
  console.log('✅ [LoadVideoModal] Video upload successful:', videoRecord);

  // Create a project-like object for the uploaded video
  const uploadProject = {
    id: videoRecord.id,
    projectType: 'single',
    title:
      videoRecord.title || videoRecord.originalFilename || 'Uploaded Video',
    video: videoRecord,
    createdAt: videoRecord.createdAt,
  };

  // Add the new project to the projects list so it appears in the load projects tab
  projects.value.unshift(uploadProject);

  // Navigate to the load projects tab to show the newly created project
  activeTab.value = 'load';

  // Emit the project-selected event to load the video
  emit('project-selected', uploadProject);

  // Don't close the modal immediately - let the user see their new project in the list
  // The modal will close when they click on the project in the load projects tab
};

const handleVideoUploadError = (error) => {
  console.error('❌ [LoadVideoModal] Video upload failed:', error);
  // Error is already handled by the VideoUpload component
};

// URL validation helper
const isValidVideoUrl = (url: string) => {
  try {
    const urlObj = new URL(url);

    // Check if it's a valid HTTP/HTTPS URL
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }

    // Check for common video file extensions
    const videoExtensions = [
      '.mp4',
      '.webm',
      '.ogg',
      '.mov',
      '.avi',
      '.mkv',
      '.m4v',
    ];
    const pathname = urlObj.pathname.toLowerCase();
    const hasVideoExtension = videoExtensions.some((ext) =>
      pathname.endsWith(ext)
    );

    // Also allow URLs that might be streaming endpoints (no extension required)
    // but should at least have a reasonable path
    const hasReasonablePath = pathname.length > 1;

    return hasVideoExtension || hasReasonablePath;
  } catch (e) {
    return false;
  }
};

// URL loading handlers
const loadVideoFromUrl = async () => {
  const trimmedUrl = urlInput.value.trim();

  if (!trimmedUrl) {
    urlError.value = 'Please enter a video URL.';
    return;
  }

  // Validate URL format
  if (!isValidVideoUrl(trimmedUrl)) {
    urlError.value =
      'Please enter a valid video URL (must be HTTP/HTTPS and preferably end with a video file extension like .mp4, .webm, etc.).';
    return;
  }

  isLoadingUrl.value = true;
  urlError.value = null;

  try {
    console.log('🎬 [LoadVideoModal] Loading video from URL:', trimmedUrl);

    // Test if the URL is accessible by creating a video element
    const testVideo = document.createElement('video');
    testVideo.preload = 'metadata';

    // Create a promise to test video loading
    const videoTestPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        testVideo.removeEventListener('loadedmetadata', onLoadedMetadata);
        testVideo.removeEventListener('error', onError);
        reject(
          new Error(
            'Video loading timeout - URL may be invalid or inaccessible'
          )
        );
      }, 10000); // 10 second timeout

      const onLoadedMetadata = () => {
        clearTimeout(timeout);
        testVideo.removeEventListener('loadedmetadata', onLoadedMetadata);
        testVideo.removeEventListener('error', onError);
        resolve({
          duration: testVideo.duration || 0,
          videoWidth: testVideo.videoWidth || 1920,
          videoHeight: testVideo.videoHeight || 1080,
        });
      };

      const onError = (e) => {
        clearTimeout(timeout);
        testVideo.removeEventListener('loadedmetadata', onLoadedMetadata);
        testVideo.removeEventListener('error', onError);
        reject(
          new Error(
            'Failed to load video - URL may be invalid, inaccessible, or not a valid video format'
          )
        );
      };

      testVideo.addEventListener('loadedmetadata', onLoadedMetadata);
      testVideo.addEventListener('error', onError);
    });

    // Set the source and start loading
    testVideo.src = trimmedUrl;

    // Wait for video to load or timeout
    const videoMetadata = await videoTestPromise;

    // Generate proper UUID for video ID (required by database)
    const generateUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
        /[xy]/g,
        function (c) {
          const r = (Math.random() * 16) | 0;
          const v = c == 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        }
      );
    };

    const videoId = generateUUID();

    // Create a URL-based project object with proper structure
    const urlProject = {
      id: generateUUID(),
      projectType: 'single',
      title: `Video from URL`,
      video: {
        id: videoId,
        videoId: videoId, // Add the missing videoId field that App.vue expects
        url: trimmedUrl,
        videoType: 'url',
        title: `Video from URL`,
        duration: videoMetadata.duration || 0,
        fps: -1, // Will be detected when video loads in player
        totalFrames: 0, // Will be calculated when FPS is detected
        originalFilename: trimmedUrl.split('/').pop() || 'video-from-url',
        filePath: null, // URL videos don't have file paths
      },
      created_at: new Date().toISOString(),
    };

    console.log('✅ [LoadVideoModal] URL video validated successfully:', {
      url: trimmedUrl,
      duration: videoMetadata.duration,
      videoId: videoId,
    });

    // Add the new project to the projects list so it appears in the load projects tab
    projects.value.unshift(urlProject);

    // Navigate to the load projects tab to show the newly created project
    activeTab.value = 'load';

    // Emit the project-selected event to load the video
    emit('project-selected', urlProject);

    // Don't close the modal immediately - let the user see their new project in the list
    // The modal will close when they click on the project in the load projects tab
  } catch (error) {
    console.error('❌ [LoadVideoModal] Error loading video from URL:', error);

    // Provide specific error messages based on the error type
    if (error.message.includes('timeout')) {
      urlError.value =
        'Video loading timed out. The URL may be slow to respond or inaccessible.';
    } else if (error.message.includes('Failed to load video')) {
      urlError.value =
        'Unable to load video from this URL. Please check that the URL is correct and points to a valid video file.';
    } else if (error.message.includes('network')) {
      urlError.value =
        'Network error while loading video. Please check your internet connection and try again.';
    } else {
      urlError.value =
        'Failed to load video from URL. Please verify the URL is correct and accessible.';
    }
  } finally {
    isLoadingUrl.value = false;
  }
};

const handleUrlKeyPress = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    loadVideoFromUrl();
  }
};

// Reset URL state
const resetUrlState = () => {
  urlInput.value = '';
  isLoadingUrl.value = false;
  urlError.value = null;
};

// Reset comparison state when modal closes
const resetComparisonState = () => {
  comparisonState.value = {
    step: 'select-video-a',
    selectedVideoA: null,
    selectedVideoB: null,
    title: '',
    description: '',
    isCreating: false,
    error: null,
  };
};

// Lifecycle hooks
onMounted(() => {
  loadLastViewedTimes();
  setupRealtimeComments();
});

onUnmounted(() => {
  cleanupRealtimeComments();
});

// Watch for modal visibility to load projects
watch(
  () => props.isVisible,
  (newValue) => {
    if (newValue && user.value) {
      loadProjects();
    }
  }
);
</script>
