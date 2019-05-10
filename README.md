# gswidget
A simple webpage widget for OStatus-based microblogs

This widget might be handy for embedding GNU Social/OStatus posts into a website.  At present, the aim is to be simple and effective.  I make no guarantees it will continue being simple.

You will need jQuery in order to use this (contact your local CDN), and you will need to make at least one tweak to the Javascript file to point it to the right place.  This is presently in the early development stage, so don't expect it to work flawlessly.  In fact, don't expect much in the range of error reporting for the time being.

Note that this may not work on older versions of Mastodon.  It looks like that's been fixed now, but before, Mastodon's Atom feeds weren't marked Access-Control-Allow-Origin.  If this isn't working on your instance, try convincing the site owner to upgrade.

Also note that the CSS is a bit flaky and probably inelegant.  If you're more experienced in the matter, then by all means, please make a pull request.
