(function () {
    'use strict';

    // ==========================================================================
    // Fancybox Gallery Initialization
    // ==========================================================================


    window.initializeFancybox = function () {
        try {
            if (typeof Fancybox !== 'undefined') {
                Fancybox.bind("[data-fancybox]", {
                    // Add some basic options for better UX
                    Toolbar: {
                        display: {
                            left: ["infobar"],
                            middle: [
                                "zoomIn",
                                "zoomOut",
                                "toggle1to1",
                                "rotateCCW",
                                "rotateCW",
                                "flipX",
                                "flipY",
                            ],
                            right: ["slideshow", "thumbs", "close"],
                        },
                    },
                    Thumbs: {
                        autoStart: false,
                    },
                });
            } else {
                console.warn('Fancybox library not loaded');
            }
        } catch (error) {
            console.error('Error initializing Fancybox:', error);
        }
    };


    window.responsiveMapHandler = (function () {
        let resizeTimeout;
        const DEBOUNCE_DELAY = 80;

        function applySquareAspectRatio() {
            try {
                const mapContainers = document.querySelectorAll('.map-container');
                const isPortraitMode = window.innerHeight > window.innerWidth;

                mapContainers.forEach(container => {
                    if (isPortraitMode) {
                        const containerWidth = container.clientWidth;
                        if (containerWidth > 0) {
                            container.style.height = containerWidth + 'px';
                        }
                    } else {

                        container.style.height = '';
                    }
                });
            } catch (error) {
                console.error('Error applying map aspect ratio:', error);
            }
        }

        function debouncedApply() {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(applySquareAspectRatio, DEBOUNCE_DELAY);
        }

        function addEventListeners() {
            try {
                window.addEventListener('resize', debouncedApply);
                window.addEventListener('orientationchange', debouncedApply);
            } catch (error) {
                console.error('Error adding event listeners:', error);
            }
        }

        return {

            init: function () {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', applySquareAspectRatio);
                } else {
                    applySquareAspectRatio();
                }

                addEventListeners();
            },

            refresh: applySquareAspectRatio,

            destroy: function () {
                clearTimeout(resizeTimeout);
                window.removeEventListener('resize', debouncedApply);
                window.removeEventListener('orientationchange', debouncedApply);
            }
        };
    })();

    window.responsiveMapHandler.init();
    window.ensureSquareMaps = window.responsiveMapHandler;

})();
