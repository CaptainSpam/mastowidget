# gswidget
A simple webpage widget for OStatus or ActivityPub-based microblogs

This widget might be handy for embedding OStatus/ActivityPub posts into a website.  At present, the aim is to be simple and effective.  I make no guarantees it will continue being simple.

You will need jQuery in order to use this (contact your local CDN), and you will need to make at least one tweak to the Javascript file to point it to the right place.  This is presently in the early development stage, so don't expect it to work flawlessly.  In fact, don't expect much in the range of error reporting for the time being.

This presently depends on the microblog publishing an RSS feed.  Specifically, this is optimized for Mastodon's RSS feed, though I hope it works with most.  Additional optimizations for other setups (especially around parsing author data) would be appreciated.  I can't just use the Mastodon API, as that would break under any other software, and Mastodon's API really, REALLY doesn't want you fetching a single user's public timeline without authentication for some reason.

Also note that the CSS is a bit flaky and probably inelegant.  If you're more experienced in the matter, then by all means, please make a pull request.
