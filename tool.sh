#!/bin/sh
if [ $1 == "post" ]; then
  mkdir static/image/$2
  hugo new post/$2.md
elif [ $1 == "update" ]; then
  find docs/* | grep -v "CNAME" | xargs rm -r
  hugo -d docs
  git add .
  git commit -m "update"
  git push origin master
else
  echo "err command:" $1
fi
