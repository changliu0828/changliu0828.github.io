#!/bin/sh
if [ $1 == "post" ]; then
  mkdir content/post/$2
  mkdir content/post/$2/image  
  hugo new post/$2/$2.md
fi
if [ $1 == "update" ]; then
  rm -r docs/*
  hugo -d docs
  git add .
  git commit -m "update"
  git push origin master
fi
