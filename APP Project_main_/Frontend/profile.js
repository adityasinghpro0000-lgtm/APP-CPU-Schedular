/* Profile picker and profile persistence for the APP Project. */
(function() {
  const STORAGE_KEYS = {
    profile: 'cpu-simulator-profile',
    profiles: 'cpu-simulator-profiles'
  };
  const DEFAULT_PROFILE = { id: 'default', name: 'Default', role: 'Project user', active: true, avatar: '' };
  let activeProfileMenuId = null;

  let profilesReady = false;
  let profileSyncQueue = Promise.resolve();

  function cacheProfiles(profiles) {
    localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles));
    const active = profiles.find(profile => profile.active) || profiles[0];
    if (active) localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(active));
  }

  async function loadProfilesFromDatabase() {
    if (!window.AppAPI) return;
    const oldProfiles = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.profiles) || '[]'); } catch (_) { return []; } })();
    let rows = await window.AppAPI.listProfiles();
    if (!rows.length) {
      const seed = oldProfiles.length ? oldProfiles : [{ ...DEFAULT_PROFILE }];
      for (const item of seed) {
        await window.AppAPI.createProfile(item.name, item.role || 'Project user');
      }
      const activeIndex = Math.max(0, seed.findIndex(item => item.active));
      rows = await window.AppAPI.listProfiles();
      if (rows[activeIndex]) await window.AppAPI.activateProfile(rows[activeIndex].id);
      rows = await window.AppAPI.listProfiles();
    }
    const cachedProfileFor = row => oldProfiles.find(old => String(old.id) === String(row.id))
      || oldProfiles.find(old => String(old.name || '').trim().toLowerCase() === String(row.name || '').trim().toLowerCase());
    // Photos are browser-local; never load or sync the database avatar field.
    rows = rows.map(row => ({ ...row, avatar: cachedProfileFor(row)?.avatar || '' }));
    const scopeMap = {};
    oldProfiles.forEach(old => {
      const match = rows.find(row => row.name.trim().toLowerCase() === String(old.name || '').trim().toLowerCase());
      if (match && old.id != null) scopeMap[old.id] = match.id;
    });
    localStorage.setItem('cpu-simulator-profile-scope-map', JSON.stringify(scopeMap));
    cacheProfiles(rows);
    profilesReady = true;
  }

  async function syncProfilesToDatabase(target) {
    const api = window.AppAPI;
    let rows = await api.listProfiles();
    const used = new Set();
    const mapped = new Map();
    for (const item of target) {
      let row = rows.find(candidate => String(candidate.id) === String(item.id));
      if (!row && !/^\d+$/.test(String(item.id))) row = rows.find(candidate => candidate.name.toLowerCase() === String(item.name).toLowerCase());
      if (!row) row = await api.createProfile(item.name, item.role || 'Project user');
      if (row.name !== item.name || row.role !== (item.role || 'Project user')) {
        row = await api.updateProfile(row.id, { name: item.name, role: item.role || 'Project user' });
      }
      mapped.set(String(item.id), row.id);
      used.add(String(row.id));
    }
    rows = await api.listProfiles();
    for (const row of rows) if (!used.has(String(row.id)) && target.length) await api.deleteProfile(row.id);
    const active = target.find(item => item.active) || target[0];
    if (active) await api.activateProfile(mapped.get(String(active.id)) || active.id);
    rows = await api.listProfiles();
    rows = rows.map(row => {
      const cached = target.find(item => String(mapped.get(String(item.id))) === String(row.id))
        || target.find(item => String(item.name || '').trim().toLowerCase() === String(row.name || '').trim().toLowerCase());
      return { ...row, avatar: cached?.avatar || '' };
    });
    cacheProfiles(rows);
    refreshProfileUI();
  }

  function ensureProfiles() {
    const saved = localStorage.getItem(STORAGE_KEYS.profiles);
    if (!saved) {
      const defaultProfile = { ...DEFAULT_PROFILE };
      localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify([defaultProfile]));
      localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(defaultProfile));
      return [defaultProfile];
    }
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (_) {
      // Recover from malformed profile data.
    }
    const fallback = [{ ...DEFAULT_PROFILE }];
    localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(fallback));
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(fallback[0]));
    return fallback;
  }

  function getProfiles() {
    const profiles = ensureProfiles();
    const activeProfile = profiles.find(profile => profile.active) || profiles[0];
    if (activeProfile) localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(activeProfile));
    return profiles;
  }

  function readProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.profile) || 'null');
      if (saved && typeof saved.name === 'string') return { ...DEFAULT_PROFILE, ...saved };
    } catch (_) {
      // Recover through the saved profile collection below.
    }
    return getProfiles()[0] || { ...DEFAULT_PROFILE };
  }

  function writeProfile(profile) {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  }

  function saveProfiles(profiles) {
    cacheProfiles(profiles);
    if (profilesReady && window.AppAPI) {
      const snapshot = JSON.parse(JSON.stringify(profiles));
      profileSyncQueue = profileSyncQueue.then(() => syncProfilesToDatabase(snapshot)).catch(error => {
        console.warn('Could not save profiles to MySQL:', error);
        showProfileStatus('Profile saved in this browser; MySQL sync failed');
      });
    }
    return profileSyncQueue;
  }

  function getInitials(name) {
    const cleaned = String(name || '').trim();
    if (!cleaned) return 'AK';
    return cleaned.split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('').slice(0, 2) || 'AK';
  }

  function getNextProfileName() {
    const names = new Set(getProfiles().map(profile => String(profile.name || '').trim().toLowerCase()));
    let number = 1;
    while (names.has(`new profile ${number}`)) number++;
    return `New Profile ${number}`;
  }

  function hasDuplicateProfileName(profiles, name, ignoredProfileId) {
    const normalizedName = String(name || '').trim().toLowerCase();
    return profiles.some(profile => String(profile.id) !== String(ignoredProfileId) && String(profile.name || '').trim().toLowerCase() === normalizedName);
  }

  function escapeHTML(value) {
    return String(value || '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function promptForInput(message, defaultValue) {
    if (typeof window.prompt !== 'function') return defaultValue;
    try {
      return window.prompt(message, defaultValue);
    } catch (_) {
      return defaultValue;
    }
  }

  function getProfileAvatarMarkup(profile) {
    if (profile?.avatar) {
      return `<span class="profile-card-avatar-image" aria-label="${escapeHTML(profile.name)} profile photo" style="background-image:url('${profile.avatar}'); background-size:cover; background-position:center;"></span>`;
    }
    return `<span class="profile-card-badge">${getInitials(profile?.name)}</span>`;
  }

  function refreshProfileUI() {
    const profile = readProfile();
    const profileToggle = document.querySelector('#profileToggle');
    const profileName = document.querySelector('#profileName');
    const profileRole = document.querySelector('#profileRole');
    const profileBadge = document.querySelector('#profileBadge');
    const profileList = document.querySelector('#profileList');
    const profiles = getProfiles();

    if (profileToggle) {
      profileToggle.textContent = profile.avatar ? '' : getInitials(profile.name);
      if (profileToggle.style) {
        profileToggle.style.backgroundImage = profile.avatar ? `url('${profile.avatar}')` : '';
        profileToggle.style.backgroundSize = 'cover';
        profileToggle.style.backgroundPosition = 'center';
      }
      profileToggle.setAttribute('title', `${profile.name} profile menu`);
      profileToggle.setAttribute('aria-label', `${profile.name} profile menu`);
    }
    if (profileName) profileName.textContent = profile.name;
    if (profileRole) profileRole.textContent = profile.role;
    if (profileBadge) {
      profileBadge.innerHTML = profile.avatar ? `<span class="profile-badge-image" role="img" aria-label="${escapeHTML(profile.name)} profile photo" style="background-image:url('${escapeHTML(profile.avatar)}'); background-size:cover; background-position:center;"></span>` : getInitials(profile.name);
    }
    if (profileList) {
      const workspaceProfilePanel = document.querySelector('#profilePanel');
      if (workspaceProfilePanel) {
        profileList.innerHTML = profiles.map(item => `
          <div class="profile-row">
            <button type="button" class="profile-chooser ${item.active ? 'active' : ''}" data-profile-select="${escapeHTML(item.id)}" aria-current="${item.active ? 'true' : 'false'}">
              <span class="profile-chooser-badge${item.avatar ? ' has-photo' : ''}"${item.avatar ? ` role="img" aria-label="${escapeHTML(item.name)} profile photo" style="background-image:url('${escapeHTML(item.avatar)}')"` : ''}>${item.avatar ? '' : getInitials(item.name)}</span>
              <span class="profile-chooser-text"><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.role)}</small></span>
              ${item.active ? '<span class="profile-active-pill">Active</span>' : ''}
            </button>
            ${profiles.length > 1 ? `<button type="button" class="profile-delete" data-profile-delete="${escapeHTML(item.id)}" aria-label="Delete ${escapeHTML(item.name)} profile" title="Delete profile"><i data-lucide="trash-2"></i></button>` : ''}
          </div>
        `).join('');
        profileList.querySelectorAll('[data-profile-select]').forEach(button => {
          button.addEventListener('click', () => setActiveProfile(button.dataset.profileSelect));
        });
        profileList.querySelectorAll('[data-profile-delete]').forEach(button => {
          button.addEventListener('click', () => {
            const target = profiles.find(item => item.id === button.dataset.profileDelete);
            if (!target || profiles.length <= 1 || !window.confirm(`Delete the ${target.name} profile?`)) return;
            if (deleteProfile(target.id)) {
              refreshProfileUI();
              showProfileStatus(`Profile deleted: ${target.name}`);
            }
          });
        });
      } else {
      profileList.innerHTML = profiles.map(item => `
        <div class="profile-card ${item.active ? 'active' : ''}" role="listitem" tabindex="0" data-profile-id="${item.id}" aria-label="${escapeHTML(item.name)} profile">
          <button type="button" class="profile-card-menu" data-profile-menu="${item.id}" aria-label="More actions for ${escapeHTML(item.name)}" title="Profile options">
            <i data-lucide="more-vertical"></i>
          </button>
          <div class="profile-card-menu-panel" data-menu-panel="${item.id}" hidden>
            <button type="button" class="profile-card-menu-action" data-profile-action="photo"><i data-lucide="image-plus"></i><span>Set custom photo</span></button>
            <button type="button" class="profile-card-menu-action" data-profile-action="remove-photo"><i data-lucide="image-off"></i><span>Remove photo</span></button>
            <button type="button" class="profile-card-menu-action danger" data-profile-action="delete"><i data-lucide="trash-2"></i><span>Delete profile</span></button>
            <input type="file" class="profile-photo-input" accept="image/*" hidden />
          </div>
          <div class="profile-card-avatar-control">
            ${getProfileAvatarMarkup(item)}
            <button type="button" class="profile-photo-trigger" data-profile-photo-trigger aria-label="Change ${escapeHTML(item.name)} profile picture" title="Change profile picture"><i data-lucide="camera"></i></button>
          </div>
          <span class="profile-card-name" data-profile-name="${item.id}" role="button" tabindex="0" aria-label="Edit ${escapeHTML(item.name)} profile name">${escapeHTML(item.name)}</span>
          <span class="profile-card-role">${escapeHTML(item.role)}</span>
        </div>
      `).join('') + `
        <button type="button" class="profile-card profile-add" id="profileAddCard" role="listitem" aria-label="Add profile">
          <span class="profile-card-badge">+</span>
          <span class="profile-card-name">Add profile</span>
        </button>
      `;
      profileList.querySelectorAll('[data-profile-id]').forEach(button => {
        const selectProfile = () => setActiveProfile(button.dataset.profileId);
        button.addEventListener('click', event => {
          if (event.target.closest('[data-profile-menu]') || event.target.closest('[data-menu-panel]') || event.target.closest('[data-profile-action]') || event.target.closest('[data-profile-photo-trigger]')) return;
          selectProfile();
        });
        button.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectProfile(); }
        });
      });
      profileList.querySelectorAll('[data-profile-photo-trigger]').forEach(button => {
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          button.closest('[data-profile-id]')?.querySelector('.profile-photo-input')?.click();
        });
      });
      profileList.querySelectorAll('[data-profile-name]').forEach(nameElement => {
        const startEditing = event => {
          event.preventDefault();
          event.stopPropagation();
          if (nameElement.querySelector('input')) return;
          const profileId = nameElement.dataset.profileName;
          const currentName = getProfiles().find(profile => String(profile.id) === String(profileId))?.name || nameElement.textContent;
          const input = document.createElement('input');
          input.className = 'profile-card-name-input';
          input.value = currentName;
          input.setAttribute('aria-label', 'Edit profile name');
          nameElement.textContent = '';
          nameElement.appendChild(input);
          input.focus();
          input.select();
          let cancelled = false;
          const finish = () => {
            if (cancelled) return;
            const nextName = input.value.trim();
            if (nextName) updateProfile(profileId, profile => ({ ...profile, name: nextName }));
            else refreshProfileUI();
          };
          input.addEventListener('blur', finish, { once: true });
          input.addEventListener('keydown', keyEvent => {
            keyEvent.stopPropagation();
            if (keyEvent.key === 'Enter') input.blur();
            if (keyEvent.key === 'Escape') { cancelled = true; refreshProfileUI(); }
          });
        };
        nameElement.addEventListener('click', startEditing);
        nameElement.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') startEditing(event);
        });
      });
      profileList.querySelectorAll('[data-profile-menu]').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          const id = button.dataset.profileMenu;
          const panel = profileList.querySelector(`[data-menu-panel="${id}"]`);
          if (!panel) return;
          const isOpen = !panel.hidden;
          closeProfileMenu();
          if (!isOpen) {
            panel.hidden = false;
            activeProfileMenuId = id;
          }
        });
      });
      profileList.querySelectorAll('[data-profile-action]').forEach(action => {
        action.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          const panel = action.closest('[data-menu-panel]');
          const profileId = panel?.dataset.menuPanel || readProfile().id;
          const actionName = action.dataset.profileAction;
          if (actionName === 'rename') renameProfile(profileId);
          if (actionName === 'photo') {
            const input = panel?.querySelector('.profile-photo-input');
            input?.click();
          }
          if (actionName === 'remove-photo') removeProfilePhoto(profileId);
          if (actionName === 'delete') {
            const target = getProfiles().find(item => String(item.id) === String(profileId));
            if (!target) return;
            if (getProfiles().length <= 1) {
              closeProfileMenu();
              showProfileStatus('Keep at least one profile');
              return;
            }
            if (!window.confirm(`Delete the ${target.name} profile?`)) return;
            if (deleteProfile(profileId)) {
              refreshProfileUI();
              showProfileStatus(`Profile deleted: ${target.name}`);
              closeProfileMenu();
            }
          }
        });
      });
      profileList.querySelectorAll('.profile-photo-input').forEach(input => {
        input.addEventListener('change', event => {
          const profileId = event.target.closest('[data-menu-panel]')?.dataset.menuPanel || readProfile().id;
          const file = event.target.files && event.target.files[0];
          if (file) setProfilePhoto(profileId, file);
          event.target.value = '';
        });
      });
      profileList.querySelector('#profileAddCard')?.addEventListener('click', () => {
        const name = promptForInput('Create a new profile name:', getNextProfileName());
        if (name !== null && createProfile(name)) showProfileStatus(`Profile created: ${name.trim()}`);
      });
      }
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }

  async function setActiveProfile(profileId) {
    const profiles = getProfiles().map(profile => ({ ...profile, active: String(profile.id) === String(profileId) }));
    const activeProfile = profiles.find(profile => profile.active) || profiles[0];
    if (!activeProfile) return;
    saveProfiles(profiles);
    writeProfile(activeProfile);
    await profileSyncQueue;
    if (window.location?.pathname?.endsWith('profile.html')) window.location.href = 'workspace.html';
    else window.location.reload();
  }

  function updateProfile(profileId, updater) {
    const savedProfiles = getProfiles();
    const currentProfile = savedProfiles.find(profile => String(profile.id) === String(profileId));
    if (!currentProfile) return false;
    const updatedProfile = updater(currentProfile);
    const currentName = String(currentProfile.name || '').trim().toLowerCase();
    const updatedName = String(updatedProfile.name || '').trim().toLowerCase();
    if (updatedName !== currentName && hasDuplicateProfileName(savedProfiles, updatedProfile.name, profileId)) {
      if (typeof window.alert === 'function') window.alert('A profile with that name already exists. Choose a unique name.');
      refreshProfileUI();
      return false;
    }
    const profiles = savedProfiles.map(profile => String(profile.id) === String(profileId) ? updatedProfile : profile);
    saveProfiles(profiles);
    const activeProfile = profiles.find(profile => profile.active) || profiles[0];
    if (activeProfile) writeProfile(activeProfile);
    refreshProfileUI();
    return true;
  }

  function closeProfileMenu() {
    document.querySelectorAll('[data-menu-panel]').forEach(panel => {
      panel.hidden = true;
    });
    activeProfileMenuId = null;
  }

  function createProfile(name) {
    const cleaned = String(name || '').trim();
    if (!cleaned) return null;
    const savedProfiles = getProfiles();
    if (hasDuplicateProfileName(savedProfiles, cleaned)) {
      if (typeof window.alert === 'function') window.alert('A profile with that name already exists. Choose a unique name.');
      return null;
    }
    const nextProfile = { id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, name: cleaned, role: 'Project user', active: true };
    const profiles = savedProfiles.map(profile => ({ ...profile, active: false }));
    profiles.push(nextProfile);
    saveProfiles(profiles);
    writeProfile(nextProfile);
    refreshProfileUI();
    return nextProfile;
  }

  function deleteProfile(profileId) {
    const profiles = getProfiles();
    if (profiles.length <= 1) return false;
    const target = profiles.find(profile => String(profile.id) === String(profileId));
    if (!target) return false;
    const remaining = profiles.filter(profile => String(profile.id) !== String(profileId));
    if (target.active) remaining[0].active = true;
    saveProfiles(remaining);
    writeProfile(remaining.find(profile => profile.active));
    clearProfileWorkspaceData(profileId);
    return true;
  }

  function clearProfileWorkspaceData(profileId) {
    const prefixes = [
      `cpu-simulator-tabs-${profileId}`,
      `cpu-simulator-active-workspace-${profileId}`,
      `cpu-simulator-logs-${profileId}`,
      `cpu-simulator-theme-${profileId}`,
      `cpu-simulator-motion-${profileId}`,
      `cpu-simulator-text-size-${profileId}`,
      `cpu-simulator-zoom-${profileId}`,
      `cpu-simulator-contrast-${profileId}`,
      `cpu-sim-ws-v3-${profileId}-`
    ];
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key && prefixes.some(prefix => key.startsWith(prefix))) localStorage.removeItem(key);
    }
  }

  function renameProfile(profileId) {
    const current = getProfiles().find(item => String(item.id) === String(profileId));
    if (!current) return;
    const name = promptForInput('Enter a display name for your profile:', current.name);
    const cleaned = String(name || '').trim();
    if (!cleaned) return;
    if (!updateProfile(profileId, profile => ({ ...profile, name: cleaned }))) return;
    showProfileStatus(`Profile renamed: ${cleaned}`);
    closeProfileMenu();
  }

  function setProfilePhoto(profileId, file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const avatar = String(reader.result || '');
      updateProfile(profileId, profile => ({ ...profile, avatar }));
      showProfileStatus('Profile photo updated');
      closeProfileMenu();
    };
    reader.readAsDataURL(file);
  }

  function removeProfilePhoto(profileId) {
    updateProfile(profileId, profile => ({ ...profile, avatar: '' }));
    showProfileStatus('Profile photo removed');
    closeProfileMenu();
  }

  function showProfileStatus(message) {
    const status = document.querySelector('#profileStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.add('visible');
    setTimeout(() => status.classList.remove('visible'), 1800);
  }

  function clearLogs() {
    localStorage.removeItem(`cpu-simulator-logs-${getStorageScope()}`);
    if (window.AppAPI) window.AppAPI.clearLogs(readProfile()?.id).catch(error => console.warn('Could not clear MySQL logs:', error));
    const list = document.querySelector('#systemLogList');
    if (list) list.innerHTML = '<li class="system-log-empty">No system activity recorded yet.</li>';
    showProfileStatus('Logs cleared');
  }

  async function initProfiles() {
    try { await loadProfilesFromDatabase(); } catch (error) { console.warn('Could not load profiles from MySQL; using browser cache:', error); }
    refreshProfileUI();
    const profileToggle = document.querySelector('#profileToggle');
    const profilePanel = document.querySelector('#profilePanel');
    if (profileToggle && profilePanel) {
      profileToggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const willOpen = profilePanel.hidden;
        profilePanel.hidden = !willOpen;
        profileToggle.setAttribute('aria-expanded', String(willOpen));
        const accessibilityPanel = document.querySelector('#accessibilityPanel');
        if (accessibilityPanel && !accessibilityPanel.hidden) {
          accessibilityPanel.hidden = true;
          document.querySelector('#accessibilityToggle')?.setAttribute('aria-expanded', 'false');
        }
        if (willOpen) profilePanel.querySelector('button')?.focus();
      });
      document.addEventListener('click', event => {
        if (!profilePanel.hidden && !profilePanel.contains(event.target) && !profileToggle.contains(event.target)) {
          profilePanel.hidden = true;
          profileToggle.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !profilePanel.hidden) {
          profilePanel.hidden = true;
          profileToggle.setAttribute('aria-expanded', 'false');
          profileToggle.focus();
        }
      });
    }

    document.querySelector('#profileChange')?.addEventListener('click', () => {
      window.location.href = 'profile.html';
    });
    document.querySelector('#profileRename')?.addEventListener('click', () => {
      const current = readProfile();
      renameProfile(current.id);
    });
    const profilePictureOption = document.querySelector('.profile-picture-option');
    const profilePictureToggle = document.querySelector('#profilePictureToggle');
    profilePictureToggle?.addEventListener('click', event => {
      event.stopPropagation();
      const isOpen = profilePictureOption.classList.toggle('open');
      profilePictureToggle.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', event => {
      if (profilePictureOption && !profilePictureOption.contains(event.target)) {
        profilePictureOption.classList.remove('open');
        profilePictureToggle?.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && profilePictureOption?.classList.contains('open')) {
        profilePictureOption.classList.remove('open');
        profilePictureToggle?.setAttribute('aria-expanded', 'false');
        profilePictureToggle?.focus();
      }
    });
    const profilePhotoInput = document.querySelector('#profilePhotoInput');
    document.querySelector('#profileAddPhoto')?.addEventListener('click', () => profilePhotoInput?.click());
    profilePhotoInput?.addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      if (file) setProfilePhoto(readProfile().id, file);
      event.target.value = '';
    });
    document.querySelector('#profileRemovePhoto')?.addEventListener('click', () => removeProfilePhoto(readProfile().id));
    document.querySelectorAll('[data-clear-logs]').forEach(button => button.addEventListener('click', () => {
      if (window.confirm('Clear all saved system logs?')) clearLogs();
    }));
    document.querySelector('#profileResetView')?.addEventListener('click', () => window.A11yManager?.resetAccessibilityPrefs());
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-profile-menu]') && !event.target.closest('[data-menu-panel]') && !event.target.closest('[data-profile-action]')) {
        closeProfileMenu();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeProfileMenu();
    });
    window.addEventListener('storage', event => {
      if (Object.values(STORAGE_KEYS).includes(event.key)) refreshProfileUI();
    });
  }

  window.ProfileManager = {
    readProfile,
    writeProfile,
    clearLogs,
    STORAGE_KEYS,
    ready: null,
    getStorageScope() { return readProfile()?.id || 'default'; },
    getLegacyStorageScope() {
      const currentId = String(readProfile()?.id || '');
      try { const map = JSON.parse(localStorage.getItem('cpu-simulator-profile-scope-map') || '{}'); return Object.keys(map).find(key => String(map[key]) === currentId) || currentId; }
      catch (_) { return currentId; }
    }
  };
  window.ProfileManager.ready = new Promise(resolve => {
    const start = () => initProfiles().finally(resolve);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  });
})();
