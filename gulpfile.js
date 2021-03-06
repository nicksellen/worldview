var gulp = require('gulp');
var babel = require('gulp-babel');

gulp.task('build', function () {
  return gulp.src('src/worldview.js')
    .pipe(babel())
    .pipe(gulp.dest('lib')); 
});

gulp.task('default', ['build']);

gulp.task('do watch', function(){
  gulp.watch('src/**', ['default']);
});

gulp.task('watch', ['default', 'do watch']);