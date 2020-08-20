---
title: "c++11特性简介"
date: 2020-08-17T16:08:08+08:00
draft: false 
---

# 1. 前言

C++自1985年发行以来成为了世界上最成功的的编程语言之一。本文总结了C++11引入的部分重要特性。完整特性与编译器支持请参考[这里$^{[1]}$](https://en.cppreference.com/w/cpp/compiler_support)。

| 年份 | 标准        | 支持的GCC版本 | 重要特性                                 |
|------|-------------|---------------|------------------------------------------|
| 2020 | c++20       | 8-11          |                                          |
| 2017 | c++17/c++1z | 5-7           |                                          |
| 2014 | C++14/c++1y | 4.9           | 函数返回类型推导，泛型lamda表达式        |
| 2011 | c++11/c++0x | 4.3-4.8       | 右值引用/移动语义/lamda表达式/多线程支持 |
| 2003 | c++03       |               | 对c++98版本的技术修订                    |
| 1998 | c++98       |               |                                          |

# 2. 部分特性及示例

## 2.1. 右值引用(rvalue references)

### 表达式的值

在C++中任意一个表达式都由**类型**和**值**两部分组成，类型为其在内存中的解析方式，值为其在内存中的内容。标题中的“右值”即为值的一种分类。

在C语言时代，表达式的值可以主要分为左值(lvalue)与右值(rvalue)。而在C++11中引入了将亡值（xvalue的概念。在C++17中更进一步引入了，纯右值（prvalue）及泛左值（glvalue）的概念，更详细的信息请参考[这里$^{[2]}$](https://en.cppreference.com/w/cpp/language/value_category)。下图展示了值分类的从属关系，对于每种分类，我们分别举例来说明，

![value_category.jpg](./image/value_category.jpg#center)

+ 左值(lvalue)：左值指明了一个函数或者对象。例如`++a`，`*p`，`std::cout<<1`的返回值。

+ 将亡值(xvalue)：指向一个对象，通常即将结束其生命周期。例如`std::move(x)`，`a[n]`其中a为右值数组，`static_cast<char&&>(x)`，
+ 纯右值(prvalue)：右值但不是将亡值。例如`a++`，`&a`，`a==b`，`42`，`str1+str2`，`str.substr(1, 2)`，`[](int x){ return x * x; }`。

+ 泛左值(glvalue，“generalized” lvalue)：左值或将亡值。

+ 右值(rvalue)：是一个将亡值，一个临时对象，或不予任何对象关联的值。

### 右值引用

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

### std::move
使用std新增函数`std::move`提供将左值转化为右值的能力，C++11对于stl大部分功能使用`std::move`进行了重写，大大提高了效率。基于移动语义的`std::sort`和`std::set::insert()`比基于拷贝语义的快15倍之多。在使用上我们应当注意对于实现了移动构造的对象，例如大部分`stl`容器，`std::string`等，在`std::move`后其本身的值将不再有效。例如，

```cpp
std::string s1 = "Hello World";
std::string s2 = std::move(s1);
//s1 = "", s2 = "Hello World"
```

