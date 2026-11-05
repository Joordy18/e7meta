// jsdom does not implement scrolling; App scrolls to the top on every page change
window.scrollTo = () => {};
