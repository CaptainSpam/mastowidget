/**
* GNU Social Widget, copyright (C)2018 Nicholas Killewald
* https://github.com/CaptainSpam/gswidget
*
* This file is distributed under the terms of the MIT License,
* a copy of which can be found in the repository listed above.
*/

// We need an Atom feed URL to make this work at all.  Add that in here.
var atomUrl = "";
// This is the ID of the element in which we're putting this.  This is the
// iframe version, so chances are what you want is "body".
var baseDiv = "body";

var authorData = {};
var postData = [];
var posts;

function constructHtml(base)
{
    // This just builds up the HTML such that we only need one div on the page
    // to begin with.
    base.empty();

    // Make sure the base is a gsw_container!
    base.addClass("gsw_container");

    var curElem = $(document.createElement("div"));
    curElem.addClass("gsw_loading");
    // Loading also has the loading text baked-in.
    curElem.text("Loading (in theory)...");
    base.append(curElem);

    curElem = $(document.createElement("div"));
    curElem.addClass("gsw_error");
    base.append(curElem);

    // The main block has a bit more going on.
    var mainBlock = $(document.createElement("div"));
    mainBlock.addClass("gsw_mainblock");

    var userBlock = $(document.createElement("div"));
    userBlock.addClass("gsw_userblock");

    // We build a-tags for the text links, sure, but here we need to wrap the
    // div with an a-tag ahead of time.
    var aElem = $(document.createElement("a"));
    curElem = $(document.createElement("div"));
    curElem.addClass("gsw_avatar");
    aElem.append(curElem);
    userBlock.append(aElem);

    var userInfo = $(document.createElement("div"));
    userInfo.addClass("gsw_userinfo");

    curElem = $(document.createElement("div"));
    curElem.addClass("gsw_userdisplayname");
    userInfo.append(curElem);

    curElem = $(document.createElement("div"));
    curElem.addClass("gsw_useratname");
    userInfo.append(curElem);

    curElem = $(document.createElement("div"));
    curElem.addClass("gsw_summary");
    userInfo.append(curElem);
    userBlock.append(userInfo);
    mainBlock.append(userBlock);

    curElem = $(document.createElement("div"));
    curElem.addClass("gsw_contentblock");
    mainBlock.append(curElem);
    base.append(mainBlock);
}

// This won't work for now.  We'll deal with this later.
/*
function fetchAtomUrlFromUser()
{
    // atomUrl wasn't defined, so we've got to figure that out from userUrl.
    // To the internet!
    $.get(userUrl, "", function(data, textStatus, jqXHR)
    {
        var xml = $(data);

        // Good!  In here should be an alternate link rel with an
        // application/atom+xml type.
        var atomData = xml.find("link[rel=alternate][type=application/atom+xml]");
        if(atomData.length <= 0)
        {
            // Well, there isn't.  Poop.
            showError("Couldn't find an Atom feed in the given user URL.  Are you sure that's the right one?");
            console.error("Couldn't find an Atom feed in the metadata found in " + userUrl + ".");
            return;
        }
        
        if(atomData.length > 1)
        {
            // If there's more than one, that's bad and not following protocol.
            // But, we'll just go with the first.
            console.warn("There's somehow multiple Atom feeds listed in " + userUrl + ".  Ignoring all but the first...");
        }

        atomUrl = atomData.first().attr("href");

        if(atomUrl.length <= 0)
        {
            // This means this instance is just completely broken.
            showError("The Atom feed for this user URL can't be found because the data returned appears to be broken somehow.");
            console.error("Found a link rel element for an Atom feed in " + userUrl + ", but the href in it was empty?  How?");
            return;
        }

        // And with that in hand, off we go to getting the data itself!
        fetchAtomData();
    }).fail(genericFetchError());
}
*/

function fetchAtomData()
{
    // With the Atom URL in hand, off we go for actual data!
    $.get(atomUrl, "", function(data, textStatus, jqXHR)
    {
        var xml = $(data);

        // Our author data.
        authorData = extractAuthorData(xml);

        // Entries!
        var posts = extractPosts(xml);

        var next = xml.find("feed link[rel=next]").attr("href");

        // We've got the data and the next, go to fetchNextPosts.  That'll stop
        // if we're done.
        fetchNextPosts(posts, next);
    }).fail(genericFetchError);
}

function fetchNextPosts(posts, next)
{
    // If we're already at 20 posts, stop now and go to finalize.
    if(postData.length >= 20 || typeof next == 'undefined' || next.length <= 0)
    {
        finalizePosts();
        return;
    }

    // We want to make sure we've got 20 posts.  The timeline will dump out
    // follows and such as "entries", so if we come up short, keep asking
    // for the next one until we either get 20 posts or we run out.
    $.get(next, "", function(data, textStatus, jqXHR)
    {
        var xml = $(data);
        var returned = extractPosts(xml);
        var next = xml.find("feed link[rel=next]").attr("href");
        // AGAIN!
        fetchNextPosts(posts, next);
    }).fail(genericFetchError);
}

function extractAuthorData(xml)
{
    // Any call to the timeline should give us author data.  This should always
    // do the trick (assuming we got good XML and it didn't throw an error).
    var author = xml.find("author");
    var authorData = {};
    authorData["displayName"] = author.find("poco\\:displayName").text();
    authorData["preferredUsername"] = author.find("poco\\:preferredUsername").text();
    authorData["avatar"] = [];

    // Avatars exist, per se, but we don't know how many or what sizes we'll
    // get.  Best to just fetch 'em all, we can sort out which one(s) are best
    // for a specific use later.
    author.find("link[rel=avatar]").each(function(index)
            {
                var avatar = $(this);
                authorData["avatar"].push({
                    href:avatar.attr("href"),
                    width:avatar.attr("media:width"),
                    height:avatar.attr("media:height")
                });
            });

    // uri appears to be the most-canon, most-technical URI to the user.  That
    // doesn't seem to be what we want; on a GNU Social instance, this includes
    // the user number (not name), which technically resolves but isn't very
    // useful on a human-readable basis (on Mastodon, we get a human-readable
    // yet still awkward "/users/something" style link).  The link tag marked as
    // "alternate" in the author data, however, appears to be the "better" link;
    // GNU Social gives us the "https://SITE/username" link and Mastodon gives
    // us "https://SITE/@username", as expected.  I sure hope this is documented
    // somewhere to be sure.
    authorData["uri"] = author.find("uri").text();
    var uriAlt = author.find("link[rel=alternate]");
    if(uriAlt.length > 0)
    {
        authorData["uriAlt"] = uriAlt.attr("href");
    }
    else
    {
        authorData["uriAlt"] = authorData["uri"];
    }
    authorData["summary"] = author.find("summary").text();
    return authorData;
}

function extractPosts(xml)
{
    // This extracts posts from XML data.  That is, all the entries that are
    // posts and not things like follows, boosts, etc.  It pushes the data
    // into the postData array as it goes along.
    var entries = xml.find("entry");

    // Filter it out to just posts (object-type is a note, verb is a post).
    var posts = xml.find("entry").filter(function(index) {
        var isNote = $(this).find("activity\\:object-type").text() == "http://activitystrea.ms/schema/1.0/note";
        var isPost = $(this).find("activity\\:verb").text() == "http://activitystrea.ms/schema/1.0/post";

        return isNote && isPost;
    });

    // Okay, we've got data.  Step through and pull out data.
    posts.each(function(index)
            {
                if(postData.length < 20)
                {
                    postData.push(extractPostData(this));
                }
            });

    return posts;
}

function extractPostData(obj)
{
    // This extracts a post object out of a single entry's XML data.  You call
    // extractPosts first, then call extractPostData from there.
    var data = $(obj);

    // What we have here is a single entry.  What we're returning is a single
    // object to push into an array.  Let's wheel and deal!
    var toReturn = {};

    // I'm not sure if any GNU Social implementation allows for a relevant title
    // to be assigned, but let's grab it anyway.
    toReturn["title"] = data.find("title").text();

    // The content!  This is the important part.
    toReturn["content"] = data.find("content").text();

    // This comes in plaintext format, which I think can be converted.
    toReturn["published"] = data.find("published").text();

    // Maybe we should provide a link to the post itself.
    toReturn["url"] = data.find("link[rel=alternate]").attr("href");

    // If this is a reply to something, we should link to the original post,
    // and maybe whatever the "local" server thinks is the conversation?  It
    // looks like the local server understands the whole conversation and wraps
    // it in its own theming.  So, ostatus:conversation appears to be "local",
    // thr:in-reply-to goes to the remote server to which this user replied.  I
    // do not know what happens if both users are on the same server.
    var found = data.find("thr\\:in-reply-to");
    if(found.length > 0)
    {
        toReturn["in-reply-to"] = found.attr("href");
    }

    found = data.find("ostatus\\:conversation");
    if(found.length > 0)
    {
        toReturn["conversation"] = found.attr("href");
    }

    // And if this is a reply, we should have a "mentioned" link rel with a
    // "person" type.
    // TODO: But we don't get a username or display name directly from that?
    // I hope we don't need to go back to the web to get it, as I don't think
    // we're guaranteed to have JS access to it...
    found = data.find("link[rel=mentioned][ostatus\\:object-type$=person]");
    if(found.length > 0)
    {
        toReturn["mentioned"] = found.attr("href");
    }

    // Finally, grab some sort of unique ID.  In GNU Social and Mastodon
    // implementations, the string found here is absurd enough that it HAS to be
    // intended as a form of opaque string.
    toReturn["id"] = data.find("id").text();

    // That should be all the data we need.  Away!
    return toReturn;
}

function getAvatarData(maxWidth)
{
    // This will pick the best avatar data for the given avatar width, assuming
    // all avatars are square and we want either the exact width or one size
    // *bigger* (as it's usually better to scale down than scale up).  We don't
    // yet have a way to guarantee sorting, so we're just searching the entire
    // array for now.

    // First, if there is no avatar data, return an empty object.
    if(authorData["avatar"].length <= 0)
    {
        return {};
    }

    var best;
    var bestDifference;
    for(var i = 0, l = authorData["avatar"].length; i < l; i++)
    {
        var data = authorData["avatar"][i];
        var width = parseInt(data["width"]);

        // If this is an exact match, we're done!  Short-circuit our way out.
        if(width == maxWidth)
        {
            return data;
        }

        // Otherwise, if this is the first one we came across, keep it.
        if(typeof best == "undefined")
        {
            best = data;
            bestDifference = width - maxWidth;
            continue;
        }

        // If this is greater than the target and closer than the current best
        // (assuming positive differences always win over negatives), this is
        // our new best.
        if((width > maxWidth && (bestDifference < 0 || bestDifference > width - maxWidth))
                || (width < maxWidth && (bestDifference < 0 && bestDifference < width - maxWidth)))
        {
            // WIN!
            best = data;
            bestDifference = width - maxWidth;
        }
    }

    // Whatever was the best, out it goes!
    return best;
}

function showError(errorText)
{
    var base = $(baseDiv);
    setMode(base, "error");
    var error = base.find(".gsw_error");
    error.text(errorText);
}

function genericFetchError(data)
{
    // Chances are the browser already dumped an error to console.log in this
    // case, so we don't need to do that here.
    showError("There was some sort of problem reading your Atom feed.  If you're sure you typed it in right, maybe that server doesn't allow cross-domain Javascript widgets access to the feed (Mastodon instances in particular might deny access by default)?");
}

function setMode(base, modeString)
{
    // Our modes of choice today are:
    //
    // "loading"
    // "display"
    // "error"
    if(modeString == "loading")
    {
        base.find(".gsw_loading").toggle(true);
        base.find(".gsw_mainblock").toggle(false);
        base.find(".gsw_error").toggle(false);
    }
    else if(modeString == "display")
    {
        base.find(".gsw_loading").toggle(false);
        base.find(".gsw_mainblock").toggle(true);
        base.find(".gsw_error").toggle(false);
    }
    else if(modeString == "error")
    {
        base.find(".gsw_loading").toggle(false);
        base.find(".gsw_mainblock").toggle(false);
        base.find(".gsw_error").toggle(true);
    }
}

function showAuthorData(base)
{
    var avatar = getAvatarData(96);

    base.find(".gsw_avatar").parent().attr("href", authorData["uriAlt"]);
    base.find(".gsw_avatar").css("background-image", "url(\"" + avatar["href"] + "\")");

    var aElem = $(document.createElement("a"));
    aElem.text(authorData["displayName"]);
    aElem.attr("href", authorData["uriAlt"]);
    base.find(".gsw_userdisplayname").append(aElem);

    var userAtName = base.find(".gsw_useratname");
    aElem = $(document.createElement("a"));
    aElem.text(authorData["uriAlt"]);
    aElem.attr("href", authorData["uriAlt"]);
    userAtName.append(aElem);
    base.find(".gsw_summary").text(authorData["summary"]);
}

function showAllPosts(base)
{
    var entries = base.find(".gsw_contentblock");

    // Later, we'll want to be able to update the content (i.e. adding more
    // entries after a timeout if more have been added at the source), but for
    // now, let's always assume a complete wipe.
    entries.empty();

    $.each(postData, function(index, data)
            {
                var entryElem = $(document.createElement("div"));
                entryElem.addClass("gsw_entry");
                entryElem.attr("id", data["id"]);

                var curElem;

                // The current layout is pretty simple.  Should just be a series
                // of blocks stacked on top of each other.

                // First, the date.  I'll do more conversion later, but for now,
                // the string we got for the date should be convertable to the
                // local timezone this way.  There's more stable ways to do
                // this, I know.
                var date = new Date(data["published"]);
                curElem = $(document.createElement("div"));
                curElem.addClass("gsw_entry_date");

                var aElem = $(document.createElement("a"));
                aElem.attr("href", data["url"]);
                aElem.text(date);
                curElem.append(aElem);
                entryElem.append(curElem);

                // We don't really get all the data we need to make a full,
                // clean "in reply to <USER>..." string here.  Until we can get
                // that, we'll settle for "(part of a conversation)" and link to
                // it on the local server.  Remember, "conversation" should
                // always exist.  in-reply-to is the one that tells us this is a
                // reply to something.
                //
                // TODO: Once we can generate "in reply to <USER>...", rewrite
                // this to link back to THAT post, not the local conversation.
                if("in-reply-to" in data)
                {
                    curElem = $(document.createElement("div"));
                    curElem.addClass("gsw_in_reply_to");

                    aElem = $(document.createElement("a"));
                    aElem.attr("href", data["conversation"]);
                    aElem.text("(part of a conversation)");
                    curElem.append(aElem);
                    entryElem.append(curElem);
                }

                // Get the content and paste that in, too.  This may need more
                // careful analysis later; as it stands, content comes in as
                // sanitized text, due to this being XML and not CDATA-wrapped.
                // However, the HTML within said text is required for things
                // like links or images to work.  I may need more work here to
                // make sure we don't have someone being a jerk and putting,
                // say, <script> tags in.
                curElem = $(document.createElement("div"));
                curElem.addClass("gsw_entry_content");
                curElem.html(data["content"]);
                entryElem.append(curElem);

                // Finally, toss the block on to the end!
                entries.append(entryElem);

                // And add a separator.
                entries.append($(document.createElement("hr")));
            });

    // And knock out that last separator.
    entries.find("hr").last().remove();
}

function finalizePosts()
{
    console.log("Found " + postData.length + " posts.");

    var base = $(baseDiv);

    setMode(base, "display");
    showAuthorData(base);
    showAllPosts(base);
}

$(document).ready(function()
{
    var widget = $(baseDiv);

    constructHtml(widget);
    setMode(widget, "loading");

    widget.css("visibility", "visible");

    // So, where do we start?
    if(atomUrl.length <= 0)
    {
        // TODO: I can't guarantee we can get to the userpage from JS, and
        // Mastodon doesn't appear to publish an RSD in the right place to
        // determine the Atom URL from a server/username combo.  So for now,
        // either the user needs to know their Atom URL or this won't work.
        showError("The atomUrl variable isn't defined in this widget; you'll need to look that up to use this widget.");
        console.error("atomUrl isn't defined; you'll need to look that up to use this.  It's right near the top of the gnu_social_widget.js file.");
        return;
        /*
        // No Atom URL.  We use the user URL.
        if(userUrl.length <= 0)
        {
            // Unless there's no user URL, either, in which case we just cry.
            showError("Either the atomUrl or userUrl variables must be defined to use this widget.");
            console.error("Either atomUrl or userUrl must be defined!");
            return;
        }

        fetchAtomUrlFromUser();
        */
    }
    else
    {
        // Atom data!  We can save an AJAX call!
        fetchAtomData();
    }
});

