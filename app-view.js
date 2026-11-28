(() => {
  const nav = document.querySelector('.app-navigation');
  const links = [...nav.querySelectorAll('a')];
  const workspaces = new Map(links.map(link => [link.hash, document.querySelector(link.hash)]));

  const imageReferences = document.getElementById('image-reference-panel');
  const imagePreview = document.getElementById('image-preview-container');
  imageReferences.parentElement.prepend(imageReferences, imagePreview);
  document.querySelector('#image-provider option[value="spicy"]').textContent = 'Seedream 5.5 Edit';
  const videoReferences = document.querySelector('#video-studio .video-frame-settings');
  videoReferences.parentElement.prepend(videoReferences);

  for (const buttonId of ['image-generate-btn', 'generate-video-btn']) {
    const submit = document.getElementById(buttonId);
    const actions = document.createElement('div');
    actions.className = 'app-production-actions';
    submit.before(actions);
    actions.append(submit);
    if (buttonId === 'image-generate-btn') actions.append(document.getElementById('image-stop-btn'));
  }

  const titles = {
    'prompt-lab': '프롬프트 랩', 'image-studio': '이미지 제작',
    'video-studio': '영상 제작', 'video-production-suite': '기획 도구'
  };
  for (const section of workspaces.values()) {
    const title = section.querySelector('.section-header h2');
    if (title) title.textContent = titles[section.id];
  }

  function showWorkspace() {
    const target = workspaces.has(location.hash) ? location.hash : '#image-studio';
    for (const [hash, section] of workspaces) section.classList.toggle('app-current', hash === target);
    for (const link of links) {
      if (link.hash === target) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  window.addEventListener('hashchange', showWorkspace);
  nav.hidden = false;
  showWorkspace();
  document.body.classList.add('app-ready');
})();
