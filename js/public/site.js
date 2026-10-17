// Entry point for every public page.
import { setupMenu, setupReveal } from './menu.js';
import { setupMedia } from './media.js';
import { setupHomepage } from './homepage.js';
import { setupLiveContent } from './live-content.js';
import { setupFormPopups } from './form-popup.js';
import { setupGallery } from './gallery.js';

setupMenu();
setupMedia();
setupHomepage();
setupLiveContent();
setupFormPopups();
setupGallery();
setupReveal();
