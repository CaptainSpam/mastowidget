# gswidget
A simple webpage widget for OStatus-based microblogs

This widget might be handy for embedding GNU Social/OStatus posts into a website.  At present, the aim is to be simple and effective.  I make no guarantees it will continue being simple.

You will need jQuery in order to use this (contact your local CDN), and you will need to make at least one tweak to the Javascript file to point it to the right place.  This is presently in the early development stage, so don't expect it to work flawlessly.  In fact, don't expect much in the range of error reporting for the time being.

Note that this will not work on newer versions of Mastodon.  They stopped using the Atom feed that this depends on to work (which, to be fair, is entirely OStatus-dependent, and that's being deprecated).  I'll be updating this soon to use the RSS feed instead, which I guess would make this more of a glorified, specific-purpose RSS reader widget, but that should at least simplify things.

Also note that the CSS is a bit flaky and probably inelegant.  If you're more experienced in the matter, then by all means, please make a pull request.
