---
title: "c++11特性简介"
date: 2020-08-17T16:08:08+08:00
draft: false 
---

# 1. 前言

C++自1985年发行以来成为了世界上最成功的的编程语言之一。本文总结了C++11引入的部分重要特性。完整特性与编译器支持请参考[这里$^{[1]}$](https://en.cppreference.com/w/cpp/compiler_support)。

<!--more-->

# 2. 部分特性及示例

## 2.1. 右值引用(rvalue references)

### 2.1.1. 表达式的值

在C++中任意一个表达式都由**类型**和**值**两部分组成，类型为其在内存中的解析方式，值为其在内存中的内容。标题中的“右值”即为值的一种分类。

在C语言时代，表达式的值可以主要分为左值(lvalue)与右值(rvalue)。而在C++11中引入了将亡值（xvalue的概念。在C++17中更进一步引入了，纯右值（prvalue）及泛左值（glvalue）的概念，更详细的信息请参考[这里$^{[2]}$](https://en.cppreference.com/w/cpp/language/value_category)。下图展示了值分类的从属关系，对于每种分类，我们分别举例来说明，

![value_category.jpg](/image/cpp11-features/value_category.jpg#center)

+ 左值(lvalue)：左值指明了一个函数或者对象。例如`++a`，`*p`，`std::cout<<1`的返回值。 

+ 将亡值(xvalue)：指向一个对象，通常即将结束其生命周期。例如`std::move(x)`，`a[n]`其中a为右值数组，`static_cast<char&&>(x)`，

+ 纯右值(prvalue)：右值但不是将亡值。例如`a++`，`&a`，`a==b`，`42`，`str1+str2`，`str.substr(1, 2)`，`[](int x){ return x * x; }`。

+ 泛左值(glvalue，“generalized” lvalue)：左值或将亡值。

+ 右值(rvalue)：是一个将亡值，一个临时对象，或不予任何对象关联的值。

### 2.1.2. 右值引用

C++11中，使用`&&`操作符取得一个右值的引用。

```cpp
int a = 1;
int& l = a;   //l是一个左值引用
int&& r = 1;  //r是一个右值引用
```

## 2.2. 移动语义(move semantics)

在`c++03`时代，我们调用类似于工厂类的如下代码，会导致两次数据的拷贝。
```cpp
//C++03
class Data {
public:
  Data(const Data& _data) { ... }
};
//调用两次拷贝构造函数(关闭返回值优化下)
Data createData() { return Data(); }  //Data()为右值
Data data(createData());              //createData()为右值
```
使用右值引用，我们可以把值从一个对象”移动“到另一个对象，这就是移动语义。使用移动语义可以减少不必要的数据拷贝，下面的代码只需要进行两次移动操作即可。
```cpp
class Data {
public:
    Data(const Data& _data) : vec(_data.vec) {} //拷贝构造
    Data(Data&& _data) : vec(_data.vec) {}      //移动构造
    std::vector<int> vec;                                 
};
Data createData() { return Data(); }
Data data(createData()); //调用两次移动构造函数
```
注：在此关闭了编译器如下优化，编译指令`g++ --std=c++11 -fno-elide-constructors`
> -fno-elide-constructors: The C++ standard allows an implementation to omit creating a temporary which is only used to initialize another object of the same type. Specifying this option disables that optimization, and forces G++ to call the copy constructor in all cases.

### 2.2.1. std::move
使用std新增函数`std::move`提供将左值转化为右值的能力，C++11对于stl大部分功能使用`std::move`进行了重写，大大提高了效率。基于移动语义的`std::sort`和`std::set::insert()`比基于拷贝语义的快15倍之多。在使用上我们应当注意对于实现了移动构造的对象，例如大部分`stl`容器，`std::string`等，在`std::move`后其本身的值将不再有效。例如，

```cpp
std::string s1 = "Hello World";
std::string s2 = std::move(s1);
//s1 = "", s2 = "Hello World"
```

## 2.3. 变长参数模板(variadic Templates)

```cpp
template<class ... T> struct Tuple {}
template<class ... Args> void myPirntf(const char*, Args...args);
```

## 2.4. 完美转发(perfect forwarding)

### 2.4.1. 引用折叠(Reference Collapsing)

## 2.5. 智能指针(smart pointer)

## 2.6. lambda表达式(lambda expressions)

```cpp
struct Point {
  int x;
  int y;
};
vector<Point> v;
//c++98
int compByX(const Point& p1, const Point& p1) { return p1.x < p2.x; } 
int compByY(const Point& p1, const Point& p1) { return p1.y < p2.y; } 
sort(v.begin, v.end(), compByX);
sort(v.begin, v.end(), compByY);
//c++11
sort(v.begin, v.end(), [](const Point& p1, const Point& p1) { return p1.x < p2.x });
sort(v.begin, v.end(), [](const Point& p1, const Point& p1) { return p1.y < p2.y });
```


## 2.7. auto类型变量(auto-typed variables)

```cpp
//c++98
std::vector<int> v;
for (std::vector<int>::iterator it = v.begin(); it != v.end(); ++ it) {
  std::cout << *it << endl;
}
//c++11
for (auto it = v.begin(); it != v.end(); ++ it) {
  std::cout << *it << endl;
}
```
## 2.8. 基于range的for循环(Range-based for)

```cpp
//c++03
std::vector<int> v;
for (std::vector<int>::iterator it = v.begin(); it != v.end(); ++ it) {
  std::cout << *it << endl;
}
//c++11
for (int& x : v) { std::cout << x << endl; }
//结合auto
for (auto& x : v) { std::cout << x << endl; } //reference
for (auto x : v) { std::cout << x << endl; }  //copy
```

## 2.9. 初始化列表(Initializer lists)

语法糖，方便对顺序数据结构初始化。

```cpp
//c++03
std::vector<int> v;
v.push_back(1);
v.push_back(2);
v.push_back(3);
//c++11
std::vector<int> v{1,2,3};
std::vector<int> v = {1,2,3};
//自定义初始化列表
#include <initializer_list>
class myVector {
public:
  myVector(const initializer_list<int>& v) {
    for (auto x : v) _v.push_back(x);
  }
private:
  std::vector<int> _v;
};
myVector mv{1,2,3};
myVector mv = {1,2,3};
```

## 2.10. static_assert

安全特性，编译器静态检查。

```cpp
static_assert( sizeof(int)==4) );
```

## 2.11. delegating constructor

语法糖，向java等语言靠近，方便开发。

```cpp
//c++03
class Foo {
public:
  Foo() { init(); }
  Foo(int x) { init(); doSomething(x); }
private:
  void init() { //to some init }
};
//c++11
class Foo {
public:
  Foo() { //to some init }
  Foo(int x) : Foo() { doSomething(x); } //Foo必须首先被调用
};
```

## 2.12. override

安全特性，显示标识函数的”重载“属性，在编译器检查，防止无效重载。

```cpp
class Base {
  virtual void A(int x);
  virtual void B() const;
};

//c++03
class Derived : public Base {
  virtual void A(float x); //OK, create a new function
  virtual void B();        //OK, create a new function
};
//c++11
class Derived : public Base {
  virtual void A(float x) override; //Error, no funtion to override
  virtual void B() override;        //Error, no funtion to override
};
```

## 2.13. final

## 2.14. delete

## 2.15. nullptr

安全特性，防止宏定义`NULL`的二义性

```cpp
void foo(int i);
void foo(void* p);
//c++98 
foo(NULL); //Error，重载歧义
//c++11
foo(nullptr); //OK, 调用void foo(void* p)
```

# 3. 参考
1. [C++ compiler support, cppreference.com](https://en.cppreference.com/w/cpp/compiler_support)
2. [Value categories, cppreference.com](https://en.cppreference.com/w/cpp/language/value_category)
3. [The Biggest Changes in C++11 (and Why You Should Care)](https://smartbear.com/blog/develop/the-biggest-changes-in-c11-and-why-you-should-care/)
4. [《深入浅出 C++ 11 右值引用》, botmanli(李俊宁), 2020, KM](http://km.oa.com/group/492/articles/show/412065?kmref=search&from_page=1&no=1)
